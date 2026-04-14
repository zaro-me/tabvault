import { v4 as uuidv4 } from 'uuid';
import * as tracker from './idle-tracker';
import * as db from '@/shared/storage';
import { assignGroups, assignNewTab, extractDomain } from '@/shared/grouping';
import { assignTabWithAI, groupTabsWithAI } from '@/shared/ai-grouping';
import { pickNextColor } from '@/shared/types';
import type { IdleEntry, StoredTab, TabGroup } from '@/shared/types';

const HEARTBEAT_ALARM    = 'tabvault-heartbeat';
const HEARTBEAT_INTERVAL_MIN = 1;
const DASHBOARD_PATH     = 'src/dashboard/index.html';

// ─── Serialized park queue ────────────────────────────────────────────────────
// Prevents race conditions when multiple tabs become idle simultaneously.
// All parkTab calls are chained onto this promise so they execute one at a time.

let parkQueue: Promise<void> = Promise.resolve();

function enqueuePark(entry: IdleEntry): void {
  parkQueue = parkQueue.then(() => doParkTab(entry)).catch(() => {
    // Don't let one failure break subsequent parks
  });
}

// ─── Initialization ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  await initAlarm();
  initContextMenu();
  await hydrateTracker();
  await ensureDashboard();
});

chrome.runtime.onStartup.addListener(async () => {
  await initAlarm();
  initContextMenu();   // re-register — menus don't persist across browser restarts in MV3
  await hydrateTracker();
  await ensureDashboard();
});

async function initAlarm() {
  await chrome.alarms.clear(HEARTBEAT_ALARM);
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_INTERVAL_MIN });
}

function initContextMenu() {
  // Firefox exposes a native `browser` global; Chrome only has `chrome`.
  // Firefox's chrome.contextMenus shim strips the 'tab' context before
  // passing it to the underlying browser.menus, so we must use browser.menus
  // directly in Firefox to get the tab-strip right-click menu working.
  const ffMenus = (globalThis as any).browser?.menus as {
    removeAll: (cb?: () => void) => void;
    create: (props: object) => void;
  } | undefined;

  const items = [
    { id: 'tv-pin',      title: '📌 Pin tab (never archive)' },
    { id: 'tv-unpin',    title: '🔓 Unpin tab' },
    { id: 'tv-sep',      type: 'separator' },
    { id: 'tv-park-now', title: '🗄️ Archive tab to vault' },
  ];
  const contexts = ['page', 'tab'];

  if (ffMenus) {
    ffMenus.removeAll(() => {
      for (const item of items) ffMenus.create({ ...item, contexts });
    });
  } else {
    chrome.contextMenus.removeAll(() => {
      for (const item of items) {
        chrome.contextMenus.create({
          ...item,
          contexts: contexts as chrome.contextMenus.ContextType[],
        });
      }
    });
  }
}

async function hydrateTracker() {
  const saved = await db.getIdleMap();
  tracker.hydrate(Object.values(saved));
}

async function ensureDashboard() {
  const { vaultTabId } = await chrome.storage.local.get('vaultTabId');
  if (vaultTabId) {
    try {
      const tab = await chrome.tabs.get(vaultTabId as number);
      if (tab) {
        if (!tab.pinned) await chrome.tabs.update(vaultTabId as number, { pinned: true });
        return;
      }
    } catch {
      // Tab was closed — fall through to open a new one
    }
  }
  const tab = await chrome.tabs.create({
    url: chrome.runtime.getURL(DASHBOARD_PATH),
    pinned: true,
    active: false,
  });
  await chrome.storage.local.set({ vaultTabId: tab.id });
}

async function focusDashboard() {
  await ensureDashboard();
  const { vaultTabId } = await chrome.storage.local.get('vaultTabId');
  if (!vaultTabId) return;
  try {
    const tab = await chrome.tabs.get(vaultTabId as number);
    await chrome.tabs.update(vaultTabId as number, { active: true });
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  } catch { /* tab gone — ensureDashboard already reopened it */ }
}

// ─── Tab Lifecycle ────────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    tracker.markActive(tabId, {
      url:        tab.url        ?? '',
      title:      tab.title      ?? '',
      faviconUrl: tab.favIconUrl ?? '',
    });
    // User returned — cancel any pending grace period
    const entry = tracker.getEntry(tabId);
    if (entry?.graceStartedAt) {
      if (entry.notificationId) chrome.notifications.clear(entry.notificationId);
      tracker.cancelGrace(tabId);
    }
    await persistIdleMap();
  } catch { /* tab may not be accessible yet */ }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.title) {
    tracker.markActive(tabId, {
      url:        tab.url        ?? '',
      title:      tab.title      ?? '',
      faviconUrl: tab.favIconUrl ?? '',
    });
    await persistIdleMap();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { vaultTabId } = await chrome.storage.local.get('vaultTabId');
  if (tabId === vaultTabId) {
    await chrome.storage.local.remove('vaultTabId');
    ensureDashboard();
  }
  tracker.removeTab(tabId);
  await persistIdleMap();
});

// ─── Heartbeat ────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) return;

  await ensureDashboard();
  const settings = await db.getSettings();

  // Periodic cleanup: remove tracker entries for tabs that no longer exist
  const aliveTabs = await chrome.tabs.query({});
  const aliveIds  = new Set(aliveTabs.map(t => t.id));
  for (const entry of tracker.getAllEntries()) {
    if (!aliveIds.has(entry.tabId)) tracker.removeTab(entry.tabId);
  }

  const idleTabs = tracker.getIdleTabs(settings.idleThresholdMs);

  if (settings.notificationsEnabled) {
    // ── Notification mode (opt-in) ────────────────────────────────────────────
    // Start grace period countdown with a notification for newly idle tabs
    for (const entry of idleTabs) {
      const notifId  = `tv-grace-${entry.tabId}`;
      const graceMin = Math.round(settings.gracePeriodMs / 60000);
      chrome.notifications.create(notifId, {
        type:               'basic',
        iconUrl:            'icons/icon48.png',
        title:              'TabVault — Tab going to sleep',
        message:            `"${truncate(entry.title, 60)}" will be archived in ${graceMin} min.`,
        buttons:            [{ title: 'Keep open' }, { title: 'Archive now' }],
        requireInteraction: false,
      });
      tracker.startGrace(entry.tabId, notifId);
    }
    // Archive tabs whose grace period has expired
    for (const entry of tracker.getGracePeriodTabs()) {
      if (tracker.expiredGrace(entry.tabId, settings.gracePeriodMs)) {
        if (entry.notificationId) chrome.notifications.clear(entry.notificationId);
        enqueuePark(entry);
      }
    }
  } else {
    // ── Silent mode (default) ─────────────────────────────────────────────────
    // Archive idle tabs immediately with no notification or grace period
    for (const entry of idleTabs) {
      enqueuePark(entry);
    }
  }

  await persistIdleMap();
});

// ─── Notifications (only active when notificationsEnabled = true) ─────────────

chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
  if (!notifId.startsWith('tv-grace-')) return;
  const tabId = parseInt(notifId.replace('tv-grace-', ''), 10);
  chrome.notifications.clear(notifId);

  if (buttonIndex === 0) {
    tracker.cancelGrace(tabId);
    tracker.markActive(tabId, {});
  } else {
    const entry = tracker.getEntry(tabId);
    if (entry) enqueuePark(entry);
  }
  await persistIdleMap();
});

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith('tv-grace-')) return;
  const tabId = parseInt(notifId.replace('tv-grace-', ''), 10);
  chrome.notifications.clear(notifId);
  tracker.cancelGrace(tabId);
  tracker.markActive(tabId, {});
  await persistIdleMap();
  try { await chrome.tabs.update(tabId, { active: true }); } catch { /* already gone */ }
});

// ─── Context Menu ─────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const { id: tabId, title = '', url = '' } = tab;

  // Reject system/extension pages for archive; allow for pin actions
  const isSystemUrl = !url || SYSTEM_PREFIXES.some(p => url.startsWith(p));

  if (info.menuItemId === 'tv-pin') {
    // Ensure tab is in the tracker before pinning (may not be tracked if just opened)
    if (!tracker.getEntry(tabId)) {
      tracker.markActive(tabId, {
        url:        tab.url        ?? '',
        title:      tab.title      ?? '',
        faviconUrl: tab.favIconUrl ?? '',
      });
    }
    tracker.setPinned(tabId, true);
    await persistIdleMap();
    chrome.notifications.create('tv-pin-confirm', {
      type:    'basic',
      iconUrl: 'icons/icon48.png',
      title:   'TabVault — Tab pinned',
      message: `"${truncate(title, 60)}" will never be archived automatically.`,
    });

  } else if (info.menuItemId === 'tv-unpin') {
    tracker.setPinned(tabId, false);
    await persistIdleMap();

  } else if (info.menuItemId === 'tv-park-now') {
    if (isSystemUrl) return;

    let entry = tracker.getEntry(tabId);
    if (entry) {
      // Cancel any active grace notification before parking
      if (entry.notificationId) chrome.notifications.clear(entry.notificationId);
    } else {
      // Tab not yet tracked (fresh browser start, newly opened tab, etc.)
      // Construct a synthetic IdleEntry directly from the browser tab object
      entry = {
        tabId,
        url:          tab.url          ?? '',
        title:        tab.title        ?? '',
        faviconUrl:   tab.favIconUrl   ?? '',
        openedAt:     (tab as { lastAccessed?: number }).lastAccessed ?? Date.now(),
        lastActiveAt: (tab as { lastAccessed?: number }).lastAccessed ?? Date.now(),
        pinned:       false,
      };
    }
    enqueuePark(entry);
  }
});

// ─── Messages (popup / dashboard) ────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    Promise.all([chrome.tabs.query({}), db.getSettings()]).then(([tabs, settings]) => {
      sendResponse({
        tabs:       tabs.length,
        entries:    tracker.getAllEntries().length,
        graceTabs:  tracker.getGracePeriodTabs().length,
        settings,
      });
    });
    return true;
  }

  if (msg.type === 'PARK_TAB') {
    const entry = tracker.getEntry(msg.tabId as number);
    if (entry) {
      enqueuePark(entry);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: 'Tab not tracked' });
    }
    return true;
  }

  if (msg.type === 'SET_PINNED') {
    tracker.setPinned(msg.tabId as number, msg.pinned as boolean);
    persistIdleMap().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'OPEN_DASHBOARD') {
    focusDashboard().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'PURGE_ALL') {
    purgeAll().then(result => sendResponse(result));
    return true;
  }

  if (msg.type === 'SNAPSHOT_ALL') {
    snapshotAll().then(result => sendResponse(result));
    return true;
  }
});

// ─── Core: Park (serialized via enqueuePark) ──────────────────────────────────

async function doParkTab(entry: IdleEntry): Promise<void> {
  const [existingTabs, existingGroups, settings] = await Promise.all([
    db.getAllTabs(),
    db.getAllGroups(),
    db.getSettings(),
  ]);

  const newTab: StoredTab = {
    id:           uuidv4(),
    url:          entry.url,
    title:        entry.title || entry.url,
    faviconUrl:   entry.faviconUrl,
    openedAt:     entry.openedAt,
    lastActiveAt: entry.lastActiveAt,
    parkedAt:     Date.now(),
    groupId:      '',
    pinned:       false,
  };

  let parkedTab: StoredTab;
  let updatedGroups: TabGroup[];

  const apiKey = settings.anthropicApiKey?.trim();

  if (apiKey) {
    // Build concise group summaries so Claude can make an informed decision
    const groupSummaries = existingGroups.map(g => ({
      id: g.id,
      label: g.label,
      tabSamples: existingTabs
        .filter(t => t.groupId === g.id)
        .slice(0, 4)
        .map(t => `"${t.title}" — ${extractDomain(t.url)}`),
    }));

    const aiResult = await assignTabWithAI(
      { index: 0, title: newTab.title, url: newTab.url },
      groupSummaries,
      apiKey,
    ).catch(() => null);

    if (aiResult) {
      if (aiResult.groupId) {
        // Place in existing group
        const group = existingGroups.find(g => g.id === aiResult.groupId)!;
        parkedTab = { ...newTab, groupId: group.id };
        updatedGroups = existingGroups.map(g =>
          g.id === group.id ? { ...g, tabIds: [...g.tabIds, newTab.id] } : g,
        );
      } else {
        // Create a new AI-named group
        const newGroup: TabGroup = {
          id:        uuidv4(),
          label:     aiResult.newGroupLabel ?? newTab.title,
          keywords:  [],
          tabIds:    [newTab.id],
          createdAt: Date.now(),
          color:     pickNextColor(existingGroups),
        };
        parkedTab     = { ...newTab, groupId: newGroup.id };
        updatedGroups = [...existingGroups, newGroup];
      }
    } else {
      // AI unavailable or failed — fall back to TF-IDF
      ({ tab: parkedTab, groups: updatedGroups } = assignNewTab(
        newTab, existingTabs, existingGroups, settings.groupingSensitivity,
      ));
    }
  } else {
    ({ tab: parkedTab, groups: updatedGroups } = assignNewTab(
      newTab, existingTabs, existingGroups, settings.groupingSensitivity,
    ));
  }

  const groupLabel = updatedGroups.find(g => g.id === parkedTab.groupId)?.label ?? parkedTab.groupId;

  await Promise.all([
    db.saveTab(parkedTab),
    ...updatedGroups.map(g => db.saveGroup(g)),
    db.bumpRecentlyArchived(),
    db.appendLog({
      type:      'archive_tab',
      message:   `Archived "${parkedTab.title || parkedTab.url}" → ${groupLabel}`,
      timestamp: Date.now(),
    }),
  ]);

  tracker.removeTab(entry.tabId);
  try { await chrome.tabs.remove(entry.tabId); } catch { /* already closed */ }

  await persistIdleMap();
  chrome.runtime.sendMessage({ type: 'VAULT_UPDATED', groupId: parkedTab.groupId }).catch(() => {});
}

// ─── Purge / Snapshot shared helpers ─────────────────────────────────────────

const SYSTEM_PREFIXES = ['chrome://', 'moz-extension://', 'chrome-extension://', 'about:', 'edge://'];

async function collectCandidateTabs(vaultTabId: number | undefined): Promise<chrome.tabs.Tab[]> {
  const allChromeTabs = await chrome.tabs.query({});
  return allChromeTabs
    .filter(t =>
      t.id !== undefined &&
      t.id !== vaultTabId &&
      t.url &&
      !SYSTEM_PREFIXES.some(p => t.url!.startsWith(p)) &&
      !t.pinned,
    )
    .sort((a, b) => (a.windowId ?? 0) - (b.windowId ?? 0) || (a.index ?? 0) - (b.index ?? 0));
}

function buildStoredTabs(chromeTabs: chrome.tabs.Tab[], now: number): StoredTab[] {
  return chromeTabs.map((t, i) => ({
    id:           uuidv4(),
    url:          t.url!,
    title:        t.title || t.url!,
    faviconUrl:   t.favIconUrl || '',
    openedAt:     (t as { lastAccessed?: number }).lastAccessed ?? now,
    lastActiveAt: (t as { lastAccessed?: number }).lastAccessed ?? now,
    parkedAt:     now - i * 100,
    groupId:      '',
    pinned:       false,
  }));
}

function applyBrowserGroups(
  chromeTabs: chrome.tabs.Tab[],
  storedTabs: StoredTab[],
  now: number,
): { preGroups: TabGroup[]; preAssigned: Set<number> } {
  const browserGroupMap = new Map<number, number[]>();
  for (let i = 0; i < chromeTabs.length; i++) {
    const gid = (chromeTabs[i] as { groupId?: number }).groupId;
    if (typeof gid === 'number' && gid > 0) {
      if (!browserGroupMap.has(gid)) browserGroupMap.set(gid, []);
      browserGroupMap.get(gid)!.push(i);
    }
  }

  const preGroups: TabGroup[]  = [];
  const preAssigned = new Set<number>();

  for (const indices of browserGroupMap.values()) {
    const groupStoredTabs = indices.map(i => storedTabs[i]);
    const domains = [...new Set(groupStoredTabs.map(t => extractDomain(t.url)).filter(Boolean))];
    const label   = domains.length === 1
      ? domains[0]
      : domains.length <= 3
        ? domains.join(' · ')
        : `${domains[0]} +${domains.length - 1} more`;

    const group: TabGroup = {
      id:        uuidv4(),
      label,
      keywords:  [],
      tabIds:    groupStoredTabs.map(t => t.id),
      createdAt: now,
    };

    for (const i of indices) {
      storedTabs[i] = { ...storedTabs[i], groupId: group.id };
      preAssigned.add(i);
    }
    preGroups.push(group);
  }

  return { preGroups, preAssigned };
}

async function assignUngrouped(
  newStoredTabs: StoredTab[],
  preAssigned: Set<number>,
  preGroups: TabGroup[],
  existingTabs: StoredTab[],
  existingGroups: TabGroup[],
  settings: import('@/shared/types').VaultSettings,
  now: number,
): Promise<{ assignedTabs: StoredTab[]; finalGroups: TabGroup[]; usedAI: boolean; aiError?: string }> {
  const ungroupedIndices = newStoredTabs.map((_, i) => i).filter(i => !preAssigned.has(i));
  const ungroupedNew     = ungroupedIndices.map(i => newStoredTabs[i]);

  const ungroupedSpread = ungroupedNew.map((t, j) => ({
    ...t,
    openedAt: now - j * 30 * 60 * 1000,
  }));

  let usedAI   = false;
  let aiError: string | undefined;
  let ungroupedAssigned: StoredTab[];
  let allGroups: TabGroup[];

  const apiKey = settings.anthropicApiKey?.trim();

  if (apiKey && ungroupedNew.length > 0) {
    const aiInput  = ungroupedNew.map((t, i) => ({ index: i, title: t.title || '', url: t.url || '' }));
    const aiResult = await groupTabsWithAI(aiInput, apiKey).catch((err: unknown) => {
      aiError = err instanceof Error ? err.message : 'Unknown error';
      return null;
    });

    if (aiResult) {
      usedAI = true;
      const aiGroupObjects: TabGroup[] = aiResult.map(ag => ({
        id:        uuidv4(),
        label:     ag.label,
        keywords:  [],
        tabIds:    ag.tabIndices.map(i => ungroupedNew[i].id),
        createdAt: now,
      }));
      for (const ag of aiResult) {
        const group = aiGroupObjects[aiResult.indexOf(ag)];
        for (const i of ag.tabIndices) ungroupedNew[i].groupId = group.id;
      }
      ungroupedAssigned = ungroupedNew;
      allGroups = [...existingGroups, ...preGroups, ...aiGroupObjects];
    } else {
      // AI failed — log reason and fall back to TF-IDF
      if (!aiError) aiError = 'AI returned no valid grouping';
      const result = assignGroups([...existingTabs, ...ungroupedSpread], settings.groupingSensitivity, existingGroups);
      ungroupedAssigned = result.tabs.filter(t => ungroupedNew.some(n => n.id === t.id));
      allGroups = [...result.groups, ...preGroups];
    }
  } else {
    const result = ungroupedNew.length > 0
      ? assignGroups([...existingTabs, ...ungroupedSpread], settings.groupingSensitivity, existingGroups)
      : { tabs: [], groups: existingGroups };
    ungroupedAssigned = result.tabs.filter(t => ungroupedNew.some(n => n.id === t.id));
    allGroups = [...result.groups, ...preGroups];
  }

  const preAssignedTabs = newStoredTabs.filter((_, i) => preAssigned.has(i));
  const assignedTabs    = [...preAssignedTabs, ...ungroupedAssigned];

  return { assignedTabs, finalGroups: allGroups, usedAI, aiError };
}

// ─── Purge All ───────────────────────────────────────────────────────────────

async function purgeAll(): Promise<{ parked: number; groups: number; usedAI: boolean; aiError?: string }> {
  const { vaultTabId } = await chrome.storage.local.get('vaultTabId');
  const tabsToPurge    = await collectCandidateTabs(vaultTabId as number | undefined);
  if (tabsToPurge.length === 0) return { parked: 0, groups: 0, usedAI: false };

  const now = Date.now();
  const [existingTabs, existingGroups, settings] = await Promise.all([
    db.getAllTabs(), db.getAllGroups(), db.getSettings(),
  ]);

  const newStoredTabs            = buildStoredTabs(tabsToPurge, now);
  const { preGroups, preAssigned } = applyBrowserGroups(tabsToPurge, newStoredTabs, now);
  const { assignedTabs, finalGroups, usedAI, aiError } = await assignUngrouped(
    newStoredTabs, preAssigned, preGroups, existingTabs, existingGroups, settings, now,
  );

  await Promise.all([
    ...assignedTabs.map(t => db.saveTab(t)),
    ...finalGroups.map(g => db.saveGroup(g)),
  ]);

  const tabIds = tabsToPurge.map(t => t.id!);
  try { await chrome.tabs.remove(tabIds); } catch { /* some may already be closed */ }

  for (const tabId of tabIds) tracker.removeTab(tabId);
  await persistIdleMap();
  chrome.runtime.sendMessage({ type: 'VAULT_UPDATED' }).catch(() => {});

  const newGroupCount = finalGroups.length - existingGroups.length;
  return { parked: tabsToPurge.length, groups: Math.max(0, newGroupCount), usedAI, aiError };
}

// ─── Snapshot All ─────────────────────────────────────────────────────────────

async function snapshotAll(): Promise<{ saved: number; groups: number; usedAI: boolean; aiError?: string }> {
  const { vaultTabId } = await chrome.storage.local.get('vaultTabId');
  const tabsToSnap     = await collectCandidateTabs(vaultTabId as number | undefined);
  if (tabsToSnap.length === 0) return { saved: 0, groups: 0, usedAI: false };

  const now = Date.now();
  const [existingTabs, existingGroups, settings] = await Promise.all([
    db.getAllTabs(), db.getAllGroups(), db.getSettings(),
  ]);

  const newStoredTabs            = buildStoredTabs(tabsToSnap, now);
  const { preGroups, preAssigned } = applyBrowserGroups(tabsToSnap, newStoredTabs, now);
  const { assignedTabs, finalGroups, usedAI, aiError } = await assignUngrouped(
    newStoredTabs, preAssigned, preGroups, existingTabs, existingGroups, settings, now,
  );

  await Promise.all([
    ...assignedTabs.map(t => db.saveTab(t)),
    ...finalGroups.map(g => db.saveGroup(g)),
  ]);

  chrome.runtime.sendMessage({ type: 'VAULT_UPDATED' }).catch(() => {});

  const newGroupCount = finalGroups.length - existingGroups.length;
  return { saved: tabsToSnap.length, groups: Math.max(0, newGroupCount), usedAI, aiError };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function persistIdleMap(): Promise<void> {
  const map: Record<number, IdleEntry> = {};
  for (const e of tracker.snapshot()) map[e.tabId] = e;
  await db.saveIdleMap(map);
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

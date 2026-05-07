import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { GroupView, StoredTab, TabGroup } from '@/shared/types';
import { pickNextColor } from '@/shared/types';
import { parseBackupMarkdown } from '@/shared/import';
import {
  deleteGroup, deleteTab, getAllGroups, getAllTabs,
  saveGroup, saveTab, getGroupOrder, saveGroupOrder,
  appendLog,
} from '@/shared/storage';
import { writeBackup, downloadBackupNow } from '@/shared/backup';

const log = (type: Parameters<typeof appendLog>[0]['type'], message: string) =>
  appendLog({ type, message, timestamp: Date.now() }).catch(() => {});

export interface VaultState {
  groups: GroupView[];
  totalTabs: number;
  loading: boolean;
}

export interface UndoEntry {
  label: string;
  restore: () => Promise<void>; // pure data ops only — reload is called by performUndo
}

export function useVault() {
  const [state, setState]       = useState<VaultState>({ groups: [], totalTabs: 0, loading: true });
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null);
  const [expandGroupSignal, setExpandGroupSignal] = useState<{ groupId: string; seq: number } | null>(null);
  const expandSeqRef = useRef(0);

  const reload = useCallback(async () => {
    const [tabs, groups, groupOrder] = await Promise.all([getAllTabs(), getAllGroups(), getGroupOrder()]);

    // Orphan cleanup: tabs whose groupId has no matching group get an Uncategorized group
    const groupIds = new Set(groups.map(g => g.id));
    const orphans  = tabs.filter(t => !groupIds.has(t.groupId));
    if (orphans.length > 0) {
      let uncategorized = groups.find(g => g.label === 'Uncategorized');
      if (!uncategorized) {
        uncategorized = { id: uuidv4(), label: 'Uncategorized', keywords: [], tabIds: [], createdAt: Date.now(), color: pickNextColor(groups) };
        groups.push(uncategorized);
        await saveGroup(uncategorized);
      }
      for (const tab of orphans) {
        const fixed = { ...tab, groupId: uncategorized!.id };
        await saveTab(fixed);
        tabs[tabs.indexOf(tab)] = fixed;
        if (!uncategorized!.tabIds.includes(tab.id)) uncategorized!.tabIds.push(tab.id);
      }
      await saveGroup(uncategorized!);
    }

    setState({ groups: buildGroupViews(tabs, groups, groupOrder), totalTabs: tabs.length, loading: false });
    writeBackup(tabs, groups).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    const onMessage = (msg: { type: string; groupId?: string }) => {
      if (msg.type === 'VAULT_UPDATED') {
        if (msg.groupId) {
          setExpandGroupSignal({ groupId: msg.groupId, seq: ++expandSeqRef.current });
        }
        reload();
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [reload]);

  // ── Undo ────────────────────────────────────────────────────────────────────

  const performUndo = useCallback(async () => {
    if (!undoEntry) return;
    const entry = undoEntry;
    setUndoEntry(null);
    await entry.restore();
    await reload();
  }, [undoEntry, reload]);

  const clearUndo = useCallback(() => setUndoEntry(null), []);

  // ── Tab actions ─────────────────────────────────────────────────────────────

  const restoreTab = useCallback(async (tab: StoredTab) => {
    await chrome.tabs.create({ url: tab.url, active: true });
    await deleteTab(tab.id);
    const [remaining, groups] = await Promise.all([getAllTabs(), getAllGroups()]);
    const group = groups.find(g => g.id === tab.groupId);
    if (!group?.manual && !remaining.some(t => t.groupId === tab.groupId)) {
      await deleteGroup(tab.groupId);
    }
    await reload();
  }, [reload]);

  const deleteTabPermanently = useCallback(async (tabId: string, groupId: string) => {
    const [tabs, groups] = await Promise.all([getAllTabs(), getAllGroups()]);
    const tab   = tabs.find(t => t.id === tabId);
    const group = groups.find(g => g.id === groupId);

    await deleteTab(tabId);
    const remaining = await getAllTabs();
    const groupNowEmpty = !remaining.some(t => t.groupId === groupId);
    if (groupNowEmpty && !group?.manual) await deleteGroup(groupId);

    if (tab) {
      log('delete_tab', `Deleted tab: "${tab.title || tab.url}"`);
      setUndoEntry({
        label: `Deleted "${tab.title || tab.url}"`,
        restore: async () => {
          await saveTab(tab);
          const currentGroups = await getAllGroups();
          const existing = currentGroups.find(g => g.id === groupId);
          if (existing) {
            await saveGroup({ ...existing, tabIds: [...existing.tabIds, tabId] });
          } else if (group) {
            // group was deleted because it became empty — restore it too
            await saveGroup({ ...group, tabIds: [tabId] });
          }
        },
      });
    }

    await reload();
  }, [reload]);

  // ── Group actions ────────────────────────────────────────────────────────────

  const renameGroup = useCallback(async (groupId: string, label: string) => {
    const groups = await getAllGroups();
    const group  = groups.find(g => g.id === groupId);
    if (group) {
      await saveGroup({ ...group, label });
      await reload();
    }
  }, [reload]);

  const createGroup = useCallback(async (label: string): Promise<{ groupId: string; label: string }> => {
    const [groups, groupOrder] = await Promise.all([getAllGroups(), getGroupOrder()]);
    const previousOrder = [...groupOrder];
    const trimmed = label.trim();
    const finalLabel = uniqueGroupLabel(trimmed || 'New folder', groups);
    const group: TabGroup = {
      id:        uuidv4(),
      label:     finalLabel,
      keywords:  [],
      tabIds:    [],
      createdAt: Date.now(),
      color:     pickNextColor(groups),
      manual:    true,
    };

    await saveGroup(group);
    const currentOrder = groupOrder.length > 0
      ? groupOrder
      : groups.slice().sort((a, b) => b.createdAt - a.createdAt).map(g => g.id);
    await saveGroupOrder([group.id, ...currentOrder.filter(id => id !== group.id)]);

    log('create_group', `Created folder "${group.label}"`);
    setUndoEntry({
      label: `Created folder "${group.label}"`,
      restore: async () => {
        const tabs = await getAllTabs();
        if (!tabs.some(t => t.groupId === group.id)) {
          await deleteGroup(group.id);
          await saveGroupOrder(previousOrder);
        }
      },
    });

    setExpandGroupSignal({ groupId: group.id, seq: ++expandSeqRef.current });
    await reload();
    return { groupId: group.id, label: group.label };
  }, [reload]);

  const deleteGroupWithTabs = useCallback(async (groupId: string) => {
    const [tabs, groups] = await Promise.all([getAllTabs(), getAllGroups()]);
    const groupTabs = tabs.filter(t => t.groupId === groupId);
    const group     = groups.find(g => g.id === groupId);

    await Promise.all(groupTabs.map(t => deleteTab(t.id)));
    await deleteGroup(groupId);

    log('delete_group', `Deleted group "${group?.label ?? ''}" (${groupTabs.length} tab${groupTabs.length !== 1 ? 's' : ''})`);
    setUndoEntry({
      label: `Deleted group "${group?.label ?? ''}" (${groupTabs.length} tab${groupTabs.length !== 1 ? 's' : ''})`,
      restore: async () => {
        if (group) await saveGroup(group);
        await Promise.all(groupTabs.map(t => saveTab(t)));
      },
    });

    await reload();
  }, [reload]);

  const restoreGroup = useCallback(async (groupId: string) => {
    const tabs = await getAllTabs();
    const groupTabs = tabs.filter(t => t.groupId === groupId);
    await Promise.all(groupTabs.map(t => chrome.tabs.create({ url: t.url, active: false })));
    await Promise.all(groupTabs.map(t => deleteTab(t.id)));
    await deleteGroup(groupId);
    await reload();
  }, [reload]);

  const moveTab = useCallback(async (
    tabId: string,
    fromGroupId: string,
    toGroupId: string | '__new__',
    newGroupLabel?: string,
  ) => {
    const [tabs, groups] = await Promise.all([getAllTabs(), getAllGroups()]);
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    let targetGroupId = toGroupId;

    if (toGroupId === '__new__') {
      const label    = newGroupLabel?.trim() || 'New group';
      const newGroup: TabGroup = { id: uuidv4(), label, keywords: [], tabIds: [], createdAt: Date.now(), color: pickNextColor(groups) };
      await saveGroup(newGroup);
      targetGroupId = newGroup.id;
    }

    // Remove from old group (delete group if now empty)
    const oldGroup = groups.find(g => g.id === fromGroupId);
    if (oldGroup) {
      const updatedOld = { ...oldGroup, tabIds: oldGroup.tabIds.filter(id => id !== tabId) };
      if (updatedOld.tabIds.length === 0 && !oldGroup.manual) await deleteGroup(fromGroupId);
      else await saveGroup(updatedOld);
    }

    // Add to target group (re-read groups in case a new one was just created above)
    const latestGroups = toGroupId === '__new__' ? await getAllGroups() : groups;
    const targetGroup  = latestGroups.find(g => g.id === targetGroupId);
    if (targetGroup) await saveGroup({ ...targetGroup, tabIds: [...targetGroup.tabIds, tabId] });

    await saveTab({ ...tab, groupId: targetGroupId });

    const targetLabel = targetGroup?.label ?? newGroupLabel ?? 'new group';
    log('move_tab', `Moved "${tab.title || tab.url}" → ${targetLabel}`);
    setUndoEntry({
      label: `Moved "${tab.title || tab.url}"`,
      restore: async () => {
        // Move back: restore tab to fromGroupId
        const currentTab = (await getAllTabs()).find(t => t.id === tabId);
        if (!currentTab) return;
        await saveTab({ ...currentTab, groupId: fromGroupId });

        const latestGroups = await getAllGroups();

        // Remove from target group
        const tg = latestGroups.find(g => g.id === targetGroupId);
        if (tg) {
          const updated = { ...tg, tabIds: tg.tabIds.filter(id => id !== tabId) };
          if (updated.tabIds.length === 0 && !tg.manual) await deleteGroup(targetGroupId);
          else await saveGroup(updated);
        }

        // Re-add to original group (restore if it was deleted)
        const fg = latestGroups.find(g => g.id === fromGroupId);
        if (fg) {
          await saveGroup({ ...fg, tabIds: [...fg.tabIds, tabId] });
        } else if (oldGroup) {
          await saveGroup({ ...oldGroup, tabIds: [tabId] });
        }
      },
    });

    await reload();
  }, [reload]);

  // ── Group ordering ───────────────────────────────────────────────────────────

  const reorderGroups = useCallback(async (newOrder: string[]) => {
    const prevOrder = await getGroupOrder();
    setUndoEntry({
      label: 'Reordered groups',
      restore: async () => { await saveGroupOrder(prevOrder); },
    });
    await saveGroupOrder(newOrder);
    await reload();
  }, [reload]);

  // ── Dedup ────────────────────────────────────────────────────────────────────

  const clearDuplicates = useCallback(async (): Promise<number> => {
    const [tabs, groups, groupOrder] = await Promise.all([getAllTabs(), getAllGroups(), getGroupOrder()]);

    // Build priority map: lower index = higher priority (kept over dupes)
    const orderIndex = new Map<string, number>(groupOrder.map((id, i) => [id, i]));
    groups
      .filter(g => !orderIndex.has(g.id))
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((g, i) => orderIndex.set(g.id, groupOrder.length + i));

    // Sort: highest-priority group first, then newest parkedAt within same group
    const sorted = [...tabs].sort((a, b) => {
      const ai = orderIndex.get(a.groupId) ?? Infinity;
      const bi = orderIndex.get(b.groupId) ?? Infinity;
      if (ai !== bi) return ai - bi;
      return b.parkedAt - a.parkedAt;
    });

    const seen     = new Set<string>();
    const toDelete: StoredTab[] = [];
    for (const tab of sorted) {
      const key = tab.url.trim().toLowerCase();
      if (seen.has(key)) toDelete.push(tab);
      else seen.add(key);
    }

    if (toDelete.length === 0) return 0;

    log('dedup', `Removed ${toDelete.length} duplicate${toDelete.length !== 1 ? 's' : ''}`);

    // Capture undo data before deletion
    const deletedTabs  = [...toDelete];
    const groupsSnap   = [...groups];

    setUndoEntry({
      label: `Removed ${toDelete.length} duplicate${toDelete.length !== 1 ? 's' : ''}`,
      restore: async () => {
        await Promise.all(deletedTabs.map(t => saveTab(t)));
        // Restore each affected group's tabIds list
        const currentGroups  = await getAllGroups();
        const currentMap     = new Map(currentGroups.map(g => [g.id, g]));
        const snapMap        = new Map(groupsSnap.map(g => [g.id, g]));
        const toUpdate       = new Map<string, Set<string>>();
        for (const tab of deletedTabs) {
          if (!toUpdate.has(tab.groupId)) {
            const cur = currentMap.get(tab.groupId);
            toUpdate.set(tab.groupId, new Set(cur?.tabIds ?? []));
          }
          toUpdate.get(tab.groupId)!.add(tab.id);
        }
        for (const [gid, tabIds] of toUpdate) {
          const g = currentMap.get(gid) ?? snapMap.get(gid);
          if (g) await saveGroup({ ...g, tabIds: [...tabIds] });
        }
      },
    });

    await Promise.all(toDelete.map(t => deleteTab(t.id)));

    // Clean up now-empty groups
    const remaining = await getAllTabs();
    const occupied  = new Set(remaining.map(t => t.groupId));
    await Promise.all(groups.filter(g => !g.manual && !occupied.has(g.id)).map(g => deleteGroup(g.id)));

    await reload();
    return toDelete.length;
  }, [reload]);

  // ── Import ───────────────────────────────────────────────────────────────────

  const importTabs = useCallback(async (
    markdownContent: string,
  ): Promise<{ tabs: number; groups: number }> => {
    const parsed = parseBackupMarkdown(markdownContent);
    if (parsed.length === 0) return { tabs: 0, groups: 0 };

    const [existingGroups, groupOrder] = await Promise.all([getAllGroups(), getGroupOrder()]);

    // Index existing groups by lowercase label for merge-on-import
    const byLabel = new Map(existingGroups.map(g => [g.label.toLowerCase().trim(), g]));
    const newOrder = [...groupOrder];

    // Collect all new tabs keyed by group id so we can batch-update tabIds
    const newTabsByGroup = new Map<string, StoredTab[]>();

    const now = Date.now();
    let totalTabs  = 0;
    let newGroups  = 0;

    // Track all groups (existing + newly created) so colors don't repeat within the import batch
    const allGroupsSoFar = [...existingGroups];

    for (const parsedGroup of parsed) {
      const labelKey = parsedGroup.label.toLowerCase().trim();

      let group = byLabel.get(labelKey);
      if (!group) {
        group = {
          id: uuidv4(),
          label: parsedGroup.label.trim(),
          keywords: [],
          tabIds: [],
          createdAt: now,
          color: pickNextColor(allGroupsSoFar),
        };
        allGroupsSoFar.push(group);
        await saveGroup(group);
        byLabel.set(labelKey, group);
        if (!newOrder.includes(group.id)) newOrder.push(group.id);
        newGroups++;
      }

      const tabs: StoredTab[] = parsedGroup.tabs.map(pt => {
        let faviconUrl = '';
        try { faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(pt.url).hostname}&sz=32`; } catch { /* ignore */ }
        return {
          id: uuidv4(),
          url: pt.url,
          title: pt.title,
          faviconUrl,
          openedAt: now,
          lastActiveAt: now,
          parkedAt: now,
          groupId: group!.id,
          pinned: false as const,
        };
      });

      if (!newTabsByGroup.has(group.id)) newTabsByGroup.set(group.id, []);
      newTabsByGroup.get(group.id)!.push(...tabs);
      totalTabs += tabs.length;
    }

    // Save all tabs
    await Promise.all([...newTabsByGroup.values()].flat().map(t => saveTab(t)));

    // Update each group's tabIds list in one pass
    const latestGroups = await getAllGroups();
    const latestMap    = new Map(latestGroups.map(g => [g.id, g]));
    await Promise.all(
      [...newTabsByGroup.entries()].map(([gid, tabs]) => {
        const g = latestMap.get(gid);
        if (!g) return Promise.resolve();
        return saveGroup({ ...g, tabIds: [...g.tabIds, ...tabs.map(t => t.id)] });
      }),
    );

    if (newOrder.length !== groupOrder.length) await saveGroupOrder(newOrder);

    log('backup', `Imported ${totalTabs} tab${totalTabs !== 1 ? 's' : ''} into ${newGroups} new group${newGroups !== 1 ? 's' : ''} (${parsed.length} total groups)`);
    await reload();
    return { tabs: totalTabs, groups: newGroups };
  }, [reload]);

  // ── Bulk actions ─────────────────────────────────────────────────────────────

  const purgeAll = useCallback(async (): Promise<{ parked: number; groups: number; usedAI: boolean }> => {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'PURGE_ALL' }, (result: { parked: number; groups: number; usedAI: boolean }) => {
        log('purge', `Purged ${result.parked} tab${result.parked !== 1 ? 's' : ''} into ${result.groups} group${result.groups !== 1 ? 's' : ''}${result.usedAI ? ' (AI-sorted)' : ''}`);
        resolve(result);
      });
    });
  }, []);

  const snapshotAll = useCallback(async (): Promise<{ saved: number; groups: number; usedAI: boolean }> => {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'SNAPSHOT_ALL' }, (result: { saved: number; groups: number; usedAI: boolean }) => {
        log('snapshot', `Snapshot: ${result.saved} tab${result.saved !== 1 ? 's' : ''} saved into ${result.groups} group${result.groups !== 1 ? 's' : ''}`);
        resolve(result);
      });
    });
  }, []);

  const downloadBackup = useCallback(async () => {
    const [tabs, groups] = await Promise.all([getAllTabs(), getAllGroups()]);
    await downloadBackupNow(tabs, groups);
    log('backup', `Backup downloaded (${tabs.length} tab${tabs.length !== 1 ? 's' : ''})`);
  }, []);

  const setGroupColor = useCallback(async (groupId: string, color: string) => {
    const groups = await getAllGroups();
    const group  = groups.find(g => g.id === groupId);
    if (group) {
      await saveGroup({ ...group, color });
      await reload();
    }
  }, [reload]);

  const clearVault = useCallback(async () => {
    const [tabs, groups] = await Promise.all([getAllTabs(), getAllGroups()]);
    await Promise.all([
      ...tabs.map(t => deleteTab(t.id)),
      ...groups.map(g => deleteGroup(g.id)),
    ]);
    log('delete_group', `Cleared vault (${tabs.length} tab${tabs.length !== 1 ? 's' : ''}, ${groups.length} group${groups.length !== 1 ? 's' : ''})`);
    await reload();
  }, [reload]);

  const mergeGroups = useCallback(async (sourceGroupId: string, targetGroupId: string) => {
    const [tabs, groups] = await Promise.all([getAllTabs(), getAllGroups()]);
    const sourceGroup = groups.find(g => g.id === sourceGroupId);
    const targetGroup = groups.find(g => g.id === targetGroupId);
    if (!sourceGroup || !targetGroup) return;

    const sourceTabs = tabs.filter(t => t.groupId === sourceGroupId);

    // Move all source tabs to target group
    await Promise.all(sourceTabs.map(t => saveTab({ ...t, groupId: targetGroupId })));
    await saveGroup({ ...targetGroup, tabIds: [...targetGroup.tabIds, ...sourceTabs.map(t => t.id)] });
    await deleteGroup(sourceGroupId);

    // Remove source from group order
    const order = await getGroupOrder();
    await saveGroupOrder(order.filter(id => id !== sourceGroupId));

    log('move_tab', `Merged group "${sourceGroup.label}" into "${targetGroup.label}" (${sourceTabs.length} tab${sourceTabs.length !== 1 ? 's' : ''})`);
    await reload();
  }, [reload]);

  return {
    state, reload,
    expandGroupSignal,
    undoEntry, performUndo, clearUndo,
    restoreTab, deleteTabPermanently,
    renameGroup, deleteGroupWithTabs, restoreGroup,
    createGroup, moveTab, reorderGroups, mergeGroups,
    purgeAll, snapshotAll, downloadBackup,
    setGroupColor, clearDuplicates, importTabs,
    clearVault,
  };
}

function buildGroupViews(
  tabs: StoredTab[],
  groups: TabGroup[],
  groupOrder: string[],
): GroupView[] {
  const groupMap = new Map(groups.map(g => [g.id, { ...g, tabs: [] as StoredTab[] }]));
  for (const tab of tabs) {
    groupMap.get(tab.groupId)?.tabs.push(tab);
  }
  const views = [...groupMap.values()];

  if (groupOrder.length > 0) {
    const orderIndex = new Map(groupOrder.map((id, i) => [id, i]));
    views.sort((a, b) => {
      const ai = orderIndex.get(a.id) ?? Infinity;
      const bi = orderIndex.get(b.id) ?? Infinity;
      if (ai !== bi) return ai - bi;
      return b.createdAt - a.createdAt; // fallback for unordered groups
    });
  } else {
    views.sort((a, b) => b.createdAt - a.createdAt);
  }

  return views;
}

function uniqueGroupLabel(label: string, groups: TabGroup[]): string {
  const existing = new Set(groups.map(g => g.label.trim().toLowerCase()));
  if (!existing.has(label.toLowerCase())) return label;

  let suffix = 2;
  while (existing.has(`${label} ${suffix}`.toLowerCase())) suffix++;
  return `${label} ${suffix}`;
}

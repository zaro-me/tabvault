import type { IdleEntry } from '@/shared/types';

/**
 * In-memory map of every live browser tab being monitored.
 * Persisted to chrome.storage.local by the service worker after each mutation
 * so it survives service worker termination/restart.
 */
const activityMap = new Map<number, IdleEntry>();

export function markActive(tabId: number, update: Partial<Omit<IdleEntry, 'tabId'>>): void {
  const existing = activityMap.get(tabId);
  activityMap.set(tabId, {
    tabId,
    url: update.url ?? existing?.url ?? '',
    title: update.title ?? existing?.title ?? '',
    faviconUrl: update.faviconUrl ?? existing?.faviconUrl ?? '',
    openedAt: existing?.openedAt ?? Date.now(),
    lastActiveAt: Date.now(),
    pinned: existing?.pinned ?? false,
    // Preserve grace state — user activity handled separately via cancelGrace
    graceStartedAt: existing?.graceStartedAt,
    notificationId: existing?.notificationId,
  });
}

export function removeTab(tabId: number): void {
  activityMap.delete(tabId);
}

export function getEntry(tabId: number): IdleEntry | undefined {
  return activityMap.get(tabId);
}

export function getAllEntries(): IdleEntry[] {
  return [...activityMap.values()];
}

/** Tabs that have exceeded the idle threshold and haven't started grace yet. */
export function getIdleTabs(thresholdMs: number): IdleEntry[] {
  const now = Date.now();
  return [...activityMap.values()].filter(
    entry =>
      !entry.pinned &&
      entry.graceStartedAt === undefined &&
      now - entry.lastActiveAt >= thresholdMs,
  );
}

/** Tabs currently in the grace countdown. */
export function getGracePeriodTabs(): IdleEntry[] {
  return [...activityMap.values()].filter(entry => entry.graceStartedAt !== undefined);
}

export function startGrace(tabId: number, notificationId: string): void {
  const entry = activityMap.get(tabId);
  if (entry && entry.graceStartedAt === undefined) {
    activityMap.set(tabId, { ...entry, graceStartedAt: Date.now(), notificationId });
  }
}

export function cancelGrace(tabId: number): void {
  const entry = activityMap.get(tabId);
  if (!entry) return;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { graceStartedAt: _g, notificationId: _n, ...rest } = entry;
  activityMap.set(tabId, rest);
}

export function expiredGrace(tabId: number, gracePeriodMs: number): boolean {
  const entry = activityMap.get(tabId);
  if (!entry?.graceStartedAt) return false;
  return Date.now() - entry.graceStartedAt >= gracePeriodMs;
}

export function setPinned(tabId: number, pinned: boolean): void {
  const entry = activityMap.get(tabId);
  if (!entry) return;
  activityMap.set(tabId, { ...entry, pinned });
  if (pinned) cancelGrace(tabId);
}

/** Restore persisted state after a service worker restart. */
export function hydrate(entries: IdleEntry[]): void {
  for (const e of entries) activityMap.set(e.tabId, e);
}

/** Snapshot for persistence. */
export function snapshot(): IdleEntry[] {
  return [...activityMap.values()];
}

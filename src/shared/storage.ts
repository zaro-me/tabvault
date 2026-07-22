import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { IdleEntry, StoredTab, TabGroup, VaultSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

// ── Activity log ──────────────────────────────────────────────────────────────

export type LogEntryType =
  | 'backup' | 'purge' | 'snapshot'
  | 'archive_tab' | 'delete_tab' | 'delete_group' | 'create_group'
  | 'move_tab' | 'dedup'
  | 'alert_dismissed';

export interface LogEntry {
  id: string;
  type: LogEntryType;
  message: string;
  timestamp: number;
}

const MAX_LOG = 500;
let logQueue: Promise<void> = Promise.resolve();

export async function appendLog(entry: Omit<LogEntry, 'id'>): Promise<void> {
  logQueue = logQueue.catch(() => undefined).then(async () => {
    const result = await chrome.storage.local.get('vaultLog');
    const log = (result.vaultLog as LogEntry[]) ?? [];
    log.unshift({ ...entry, id: crypto.randomUUID() });
    if (log.length > MAX_LOG) log.length = MAX_LOG;
    await chrome.storage.local.set({ vaultLog: log });
  });
  return logQueue;
}

export async function getLog(): Promise<LogEntry[]> {
  const result = await chrome.storage.local.get('vaultLog');
  return (result.vaultLog as LogEntry[]) ?? [];
}

// ── Dismissed alerts ──────────────────────────────────────────────────────────

export async function getDismissedAlerts(): Promise<string[]> {
  const result = await chrome.storage.local.get('dismissedAlerts');
  return (result.dismissedAlerts as string[]) ?? [];
}

export async function saveDismissedAlerts(keys: string[]): Promise<void> {
  await chrome.storage.local.set({ dismissedAlerts: keys });
}

interface VaultDB extends DBSchema {
  tabs: {
    key: string;
    value: StoredTab;
    indexes: { 'by-group': string; 'by-parkedAt': number };
  };
  groups: {
    key: string;
    value: TabGroup;
  };
}

let _db: IDBPDatabase<VaultDB> | null = null;

async function getDB(): Promise<IDBPDatabase<VaultDB>> {
  if (!_db) {
    _db = await openDB<VaultDB>('tabvault', 1, {
      upgrade(db) {
        const tabStore = db.createObjectStore('tabs', { keyPath: 'id' });
        tabStore.createIndex('by-group', 'groupId');
        tabStore.createIndex('by-parkedAt', 'parkedAt');
        db.createObjectStore('groups', { keyPath: 'id' });
      },
    });
  }
  return _db;
}

// --- Tab operations ---

export async function saveTab(tab: StoredTab): Promise<void> {
  const db = await getDB();
  await db.put('tabs', tab);
}

export async function getAllTabs(): Promise<StoredTab[]> {
  const db = await getDB();
  return db.getAll('tabs');
}

export async function getTabById(id: string): Promise<StoredTab | undefined> {
  const db = await getDB();
  return db.get('tabs', id);
}

export async function deleteTab(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('tabs', id);
}

// --- Group operations ---

export async function saveGroup(group: TabGroup): Promise<void> {
  const db = await getDB();
  await db.put('groups', group);
}

export async function getAllGroups(): Promise<TabGroup[]> {
  const db = await getDB();
  return db.getAll('groups');
}

export async function deleteGroup(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('groups', id);
}

export async function clearVaultData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['tabs', 'groups'], 'readwrite');
  await Promise.all([tx.objectStore('tabs').clear(), tx.objectStore('groups').clear()]);
  await tx.done;
}

// --- Settings (chrome.storage.local) ---

export async function getSettings(): Promise<VaultSettings> {
  const result = await chrome.storage.local.get('settings');
  const saved = result.settings as Partial<VaultSettings> | undefined;
  const settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  return {
    ...settings,
    llmApiKey: settings.llmApiKey ?? settings.anthropicApiKey,
  };
}

export async function saveSettings(settings: VaultSettings): Promise<void> {
  const nextSettings = { ...settings };
  delete nextSettings.anthropicApiKey;
  await chrome.storage.local.set({ settings: nextSettings });
}

// --- Group order (chrome.storage.local) ---

export async function getGroupOrder(): Promise<string[]> {
  const result = await chrome.storage.local.get('groupOrder');
  return (result.groupOrder as string[]) ?? [];
}

export async function saveGroupOrder(order: string[]): Promise<void> {
  await chrome.storage.local.set({ groupOrder: order });
}

// --- Recently archived (for passive-mode dashboard hint) ---

export async function bumpRecentlyArchived(): Promise<void> {
  const result = await chrome.storage.local.get('recentlyArchived');
  const prev   = result.recentlyArchived as { count: number; since: number } | undefined;
  const now    = Date.now();
  const TWO_H  = 2 * 60 * 60 * 1000;
  const since  = prev && now - prev.since < TWO_H ? prev.since : now;
  const count  = prev && now - prev.since < TWO_H ? prev.count + 1 : 1;
  await chrome.storage.local.set({ recentlyArchived: { count, since } });
}

export async function getRecentlyArchived(): Promise<{ count: number; since: number } | null> {
  const result = await chrome.storage.local.get('recentlyArchived');
  const data   = result.recentlyArchived as { count: number; since: number } | undefined;
  if (!data) return null;
  if (Date.now() - data.since > 2 * 60 * 60 * 1000) return null;
  return data;
}

export async function clearRecentlyArchived(): Promise<void> {
  await chrome.storage.local.remove('recentlyArchived');
}

// --- Idle map (chrome.storage.local) ---
// Persists the in-memory activity map across service worker restarts.

export async function getIdleMap(): Promise<Record<number, IdleEntry>> {
  const result = await chrome.storage.local.get('idleMap');
  return (result.idleMap as Record<number, IdleEntry>) ?? {};
}

export async function saveIdleMap(map: Record<number, IdleEntry>): Promise<void> {
  await chrome.storage.local.set({ idleMap: map });
}

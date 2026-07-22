export interface StoredTab {
  id: string;
  url: string;
  title: string;
  faviconUrl: string;
  openedAt: number;      // timestamp when the original browser tab was first opened
  lastActiveAt: number;  // timestamp of last user interaction before parking
  parkedAt: number;      // timestamp when the tab was archived
  groupId: string;
  pinned: false;         // always false — archived tabs cannot be pinned
}

export interface TabGroup {
  id: string;
  label: string;
  keywords: string[];
  tabIds: string[];
  createdAt: number;
  color?: string;
  /** User-created folders are allowed to remain visible even when empty. */
  manual?: boolean;
}

// Represents a live browser tab being monitored by the service worker
export interface IdleEntry {
  tabId: number;
  url: string;
  title: string;
  faviconUrl: string;
  openedAt: number;
  lastActiveAt: number;
  pinned: boolean;           // user exemption set from TabVault
  browserPinned?: boolean;   // native browser pin; also exempt from archiving
  graceStartedAt?: number;   // set when the countdown notification fires
  notificationId?: string;
}

export interface VaultSettings {
  /** Automatic idle archiving is opt-in. Manual archive actions always remain available. */
  autoArchiveEnabled: boolean;
  idleThresholdMs: number;
  gracePeriodMs: number;
  ignoredDomains: string[];
  groupingSensitivity: 'low' | 'medium' | 'high';
  llmApiKey?: string;
  /** @deprecated Migrated to llmApiKey. Kept so older saved settings load cleanly. */
  anthropicApiKey?: string;
  /** When false, automatically archived tabs are handled silently with no grace period. */
  notificationsEnabled: boolean;
  /** When true, a normal restore removes the saved link from the vault. */
  removeOnRestore: boolean;
}

export const DEFAULT_SETTINGS: VaultSettings = {
  autoArchiveEnabled: false,               // automatic idle archiving is opt-in
  idleThresholdMs: 2 * 60 * 60 * 1000,  // 2 hours
  gracePeriodMs: 15 * 60 * 1000,         // 15 minutes
  ignoredDomains: [],
  groupingSensitivity: 'medium',
  notificationsEnabled: false,
  removeOnRestore: true,                   // preserves the existing restore behavior
};

// Predefined color palette for groups
export const GROUP_COLORS = [
  { id: 'none',   label: 'None',   bar: '' },
  { id: 'indigo', label: 'Indigo', bar: 'bg-indigo-500' },
  { id: 'blue',   label: 'Blue',   bar: 'bg-blue-500' },
  { id: 'cyan',   label: 'Cyan',   bar: 'bg-cyan-500' },
  { id: 'green',  label: 'Green',  bar: 'bg-green-500' },
  { id: 'yellow', label: 'Yellow', bar: 'bg-yellow-400' },
  { id: 'orange', label: 'Orange', bar: 'bg-orange-500' },
  { id: 'red',    label: 'Red',    bar: 'bg-red-500' },
  { id: 'pink',   label: 'Pink',   bar: 'bg-pink-500' },
  { id: 'purple', label: 'Purple', bar: 'bg-purple-500' },
] as const;

export type GroupColorId = typeof GROUP_COLORS[number]['id'];

/**
 * Returns the color ID (never 'none') that is least used across existingGroups.
 * Ties are broken by palette order so colors cycle predictably.
 */
export function pickNextColor(existingGroups: TabGroup[]): GroupColorId {
  const usable = GROUP_COLORS.filter(c => c.id !== 'none').map(c => c.id as GroupColorId);
  const counts  = new Map<GroupColorId, number>(usable.map(id => [id, 0]));
  for (const g of existingGroups) {
    const id = g.color as GroupColorId | undefined;
    if (id && id !== 'none' && counts.has(id)) counts.set(id, counts.get(id)! + 1);
  }
  let best = usable[0];
  for (const id of usable) {
    if ((counts.get(id) ?? 0) < (counts.get(best) ?? 0)) best = id;
  }
  return best;
}

// Groups with their tabs pre-joined — used in dashboard rendering
export interface GroupView extends TabGroup {
  tabs: StoredTab[];
}

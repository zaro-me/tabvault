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
}

// Represents a live browser tab being monitored by the service worker
export interface IdleEntry {
  tabId: number;
  url: string;
  title: string;
  faviconUrl: string;
  openedAt: number;
  lastActiveAt: number;
  pinned: boolean;           // permanently exempt from archiving
  graceStartedAt?: number;   // set when the countdown notification fires
  notificationId?: string;
}

export interface VaultSettings {
  idleThresholdMs: number;
  gracePeriodMs: number;
  ignoredDomains: string[];
  groupingSensitivity: 'low' | 'medium' | 'high';
  anthropicApiKey?: string;
}

export const DEFAULT_SETTINGS: VaultSettings = {
  idleThresholdMs: 2 * 60 * 60 * 1000,  // 2 hours
  gracePeriodMs: 15 * 60 * 1000,         // 15 minutes
  ignoredDomains: [],
  groupingSensitivity: 'medium',
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

// Groups with their tabs pre-joined — used in dashboard rendering
export interface GroupView extends TabGroup {
  tabs: StoredTab[];
}

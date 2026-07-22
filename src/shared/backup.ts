import type { StoredTab, TabGroup } from './types';

const BACKUP_FILENAME = 'tabvault-backup.md';
const AUTO_THROTTLE_MS = 5 * 60 * 1000; // auto-backup at most once per 5 minutes
const AUTO_BACKUP_KEY = 'lastAutoBackupAt';

let autoBackupPromise: Promise<void> | null = null;

/**
 * Auto-backup: throttled, called on every vault reload.
 * Writes tabvault-backup.md to the user's Downloads folder (overwrites).
 */
export async function writeBackup(tabs: StoredTab[], groups: TabGroup[]): Promise<void> {
  if (tabs.length === 0) return;
  if (autoBackupPromise) return autoBackupPromise;

  autoBackupPromise = (async () => {
    const result = await chrome.storage.local.get(AUTO_BACKUP_KEY);
    const lastAutoBackupAt = Number(result[AUTO_BACKUP_KEY]) || 0;
    const now = Date.now();
    if (now - lastAutoBackupAt < AUTO_THROTTLE_MS) return;
    await download(tabs, groups);
    await chrome.storage.local.set({ [AUTO_BACKUP_KEY]: now });
  })().finally(() => {
    autoBackupPromise = null;
  });

  return autoBackupPromise;
}

/**
 * Manual backup: always fires immediately, no throttle.
 * Called when the user explicitly clicks "Download backup".
 */
export async function downloadBackupNow(tabs: StoredTab[], groups: TabGroup[]): Promise<void> {
  if (tabs.length === 0) return;
  await download(tabs, groups);
  await chrome.storage.local.set({ [AUTO_BACKUP_KEY]: Date.now() });
}

async function download(tabs: StoredTab[], groups: TabGroup[]): Promise<void> {
  const content = generateMarkdown(tabs, groups);
  const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: BACKUP_FILENAME,
      conflictAction: 'overwrite',
      saveAs: false,
    });
  } finally {
    // Revoke after a short delay so the download has time to start
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

// ── Markdown generation ───────────────────────────────────────────────────────

export function generateMarkdown(tabs: StoredTab[], groups: TabGroup[]): string {
  const now      = new Date().toLocaleString();
  const groupMap = new Map(groups.map(g => [g.id, g]));

  const byGroup = new Map<string, StoredTab[]>();
  for (const tab of tabs) {
    if (!byGroup.has(tab.groupId)) byGroup.set(tab.groupId, []);
    byGroup.get(tab.groupId)!.push(tab);
  }

  const sortedGroups = [...byGroup.keys()]
    .map(id => ({ id, group: groupMap.get(id), tabs: byGroup.get(id)! }))
    .sort((a, b) => (a.group?.createdAt ?? 0) - (b.group?.createdAt ?? 0));

  let md = [
    '# TabVault Backup',
    '',
    `> Last updated: ${now}`,
    `> Total archived tabs: ${tabs.length} across ${sortedGroups.length} groups`,
    '',
    '---',
    '',
  ].join('\n');

  for (const { group, tabs: groupTabs } of sortedGroups) {
    const label = group?.label ?? 'Uncategorized';
    const count = groupTabs.length;
    md += `## ${label} (${count} tab${count !== 1 ? 's' : ''})\n\n`;

    for (const tab of groupTabs.sort((a, b) => b.parkedAt - a.parkedAt)) {
      const date  = new Date(tab.parkedAt).toLocaleDateString();
      const title = escapeMarkdown(tab.title || tab.url);
      md += `- [${title}](<${tab.url.replace(/>/g, '%3E')}>) — *archived ${date}*\n`;
    }
    md += '\n';
  }

  return md;
}

function escapeMarkdown(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/[[\]]/g, '\\$&');
}

export interface ParsedTab {
  title: string;
  url: string;
}

export interface ParsedGroup {
  label: string;
  tabs: ParsedTab[];
}

/**
 * Parses a TabVault backup markdown file into groups + tabs.
 * Handles both formats:
 *   ## Group Name (N tabs)         — from backup.ts
 *   ## Group Name                  — from backup_new.md / manual
 *
 *   - [Title](URL) — *archived DATE*   — standard
 *   - [Title](URL)                     — no date
 *   - https://plain-url                — plain URL, no title
 */
export function parseBackupMarkdown(content: string): ParsedGroup[] {
  const lines = content.split('\n');
  const groups: ParsedGroup[] = [];
  let current: ParsedGroup | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Group heading: ## Label (optional count)
    const groupMatch = line.match(/^## (.+?)(?:\s*\(\d+\s*tabs?\))?$/i);
    if (groupMatch) {
      current = { label: groupMatch[1].trim(), tabs: [] };
      groups.push(current);
      continue;
    }

    if (!current) continue;

    // Markdown link: - [Title](URL) (anything after closing paren is ignored)
    const linkMatch = line.match(/^-\s+\[(.+?)\]\((https?:\/\/[^)]+)\)/);
    if (linkMatch) {
      const title = linkMatch[1].replace(/\\([[\]])/g, '$1').trim(); // unescape \[ \]
      current.tabs.push({ title, url: linkMatch[2].trim() });
      continue;
    }

    // Plain URL: - https://...
    const urlMatch = line.match(/^-\s+(https?:\/\/\S+)/);
    if (urlMatch) {
      const url = urlMatch[1].trim();
      current.tabs.push({ title: url, url });
    }
  }

  return groups.filter(g => g.tabs.length > 0);
}

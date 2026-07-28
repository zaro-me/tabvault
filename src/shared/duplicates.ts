import type { StoredTab } from './types';
import { canonicalUrlKey } from './url';

export interface GoogleDocsDuplicateCandidate {
  keep: StoredTab;
  remove: StoredTab;
}

export interface DuplicateRemovalPlan {
  exactDuplicates: StoredTab[];
  googleDocsCandidates: GoogleDocsDuplicateCandidate[];
}

export interface DuplicateCleanupResult {
  removed: number;
  googleDocsCandidates: GoogleDocsDuplicateCandidate[];
}

/**
 * Returns a stable identity for Google Workspace documents while deliberately
 * ignoring page, slide, sheet, tab, and section selectors.
 */
export function googleDocsDocumentKey(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    if (url.hostname.toLowerCase() !== 'docs.google.com') return null;

    const match = url.pathname.match(
      /^\/(document|presentation|spreadsheets|forms)(?:\/u\/\d+)?\/d\/(?:e\/)?([^/]+)/i,
    );
    if (!match) return null;

    return `google-docs:${match[1].toLowerCase()}:${match[2]}`;
  } catch {
    return null;
  }
}

/**
 * The input must already be ordered from highest- to lowest-priority copy.
 * Exact URL duplicates can be removed immediately. Different locations within
 * one Google document are returned separately so the user can review them.
 */
export function planDuplicateRemoval(sortedTabs: StoredTab[]): DuplicateRemovalPlan {
  const seenUrls = new Set<string>();
  const googleDocsKeepers = new Map<string, StoredTab>();
  const exactDuplicates: StoredTab[] = [];
  const googleDocsCandidates: GoogleDocsDuplicateCandidate[] = [];

  for (const tab of sortedTabs) {
    const documentKey = googleDocsDocumentKey(tab.url);
    if (documentKey) {
      // A fragment or query parameter can point at a meaningful slide, sheet,
      // tab, or section. Only byte-for-byte-equivalent normalized Google Docs
      // URLs are automatic duplicates; other locations require review.
      const fullUrlKey = normalizedFullUrl(tab.url);
      if (seenUrls.has(fullUrlKey)) {
        exactDuplicates.push(tab);
        continue;
      }
      seenUrls.add(fullUrlKey);

      const keeper = googleDocsKeepers.get(documentKey);
      if (keeper) {
        googleDocsCandidates.push({ keep: keeper, remove: tab });
      } else {
        googleDocsKeepers.set(documentKey, tab);
      }
      continue;
    }

    const urlKey = canonicalUrlKey(tab.url);
    if (seenUrls.has(urlKey)) {
      exactDuplicates.push(tab);
      continue;
    }
    seenUrls.add(urlKey);
  }

  return { exactDuplicates, googleDocsCandidates };
}

function normalizedFullUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl.trim()).href;
  } catch {
    return rawUrl.trim();
  }
}

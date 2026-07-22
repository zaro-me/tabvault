import { describe, expect, it } from 'vitest';
import { generateMarkdown } from '../backup';
import { parseBackupMarkdown } from '../import';
import type { StoredTab, TabGroup } from '../types';

describe('backup round trip', () => {
  it('preserves titles and URLs containing Markdown punctuation', () => {
    const group: TabGroup = {
      id: 'g1', label: 'Research', keywords: [], tabIds: ['t1'], createdAt: 1,
    };
    const tab: StoredTab = {
      id: 't1', groupId: 'g1', title: String.raw`A [useful] \\ guide`,
      url: 'https://example.com/docs/(draft)?q=a(b)', faviconUrl: '',
      openedAt: 1, lastActiveAt: 2, parkedAt: 3, pinned: false,
    };

    const parsed = parseBackupMarkdown(generateMarkdown([tab], [group]));
    expect(parsed).toEqual([{ label: 'Research', tabs: [{ title: tab.title, url: tab.url }] }]);
  });
});

import { describe, expect, it } from 'vitest';
import { assignGroups, extractDomain } from '../grouping';
import type { StoredTab } from '../types';

function tab(partial: Pick<StoredTab, 'id' | 'url' | 'title'> & Partial<StoredTab>): StoredTab {
  return {
    faviconUrl: '',
    openedAt: Date.now(),
    lastActiveAt: Date.now(),
    parkedAt: Date.now(),
    groupId: '',
    pinned: false,
    ...partial,
  };
}

describe('extractDomain', () => {
  it('strips www prefix', () => {
    expect(extractDomain('https://www.github.com/user')).toBe('github.com');
  });
  it('returns empty string for invalid URLs', () => {
    expect(extractDomain('not-a-url')).toBe('');
  });
});

describe('assignGroups', () => {
  it('returns empty output for empty input', () => {
    const { tabs, groups } = assignGroups([], 'medium', []);
    expect(tabs).toHaveLength(0);
    expect(groups).toHaveLength(0);
  });

  it('creates a single group for a single tab', () => {
    const { tabs, groups } = assignGroups(
      [tab({ id: '1', url: 'https://example.com', title: 'Example' })],
    );
    expect(groups).toHaveLength(1);
    expect(tabs[0].groupId).toBe(groups[0].id);
  });

  it('groups tabs from the same domain together', () => {
    const base = Date.now();
    const tabs = [
      tab({ id: '1', url: 'https://github.com/user/repo',  title: 'GitHub Repo',  openedAt: base }),
      tab({ id: '2', url: 'https://github.com/user/other', title: 'GitHub Other', openedAt: base + 2 * 60_000 }),
      // HN is more than 20 min apart so it won't be pulled in by time proximity
      tab({ id: '3', url: 'https://news.ycombinator.com',  title: 'Hacker News',  openedAt: base + 60 * 60_000 }),
    ];
    const { tabs: result, groups } = assignGroups(tabs, 'medium');
    const githubGroup = groups.find(g => result.filter(t => t.groupId === g.id).some(t => t.url.includes('github')));
    expect(githubGroup).toBeDefined();
    expect(result.filter(t => t.groupId === githubGroup!.id)).toHaveLength(2);
  });

  it('groups topically similar tabs across domains', () => {
    // Use 'high' sensitivity (lower threshold) + rich overlapping titles to ensure similarity fires
    const base = Date.now();
    const tabs = [
      tab({ id: '1', url: 'https://site1.com/typescript-tutorial', title: 'TypeScript TypeScript Tutorial Guide', openedAt: base }),
      tab({ id: '2', url: 'https://site2.com/typescript-handbook',  title: 'TypeScript TypeScript Handbook Reference', openedAt: base + 60 * 60_000 }),
      tab({ id: '3', url: 'https://site3.com/cooking-pasta',        title: 'Best Pasta Recipes Cooking Kitchen', openedAt: base + 2 * 60 * 60_000 }),
    ];
    const { tabs: result, groups } = assignGroups(tabs, 'high');
    const tsGroup = groups.find(g =>
      result.filter(t => t.groupId === g.id).every(t => t.url.includes('typescript')),
    );
    expect(tsGroup).toBeDefined();
    expect(result.filter(t => t.groupId === tsGroup!.id)).toHaveLength(2);
  });

  it('falls back to time proximity for unrelated tabs opened close together', () => {
    const base = Date.now();
    const tabs = [
      tab({ id: '1', url: 'https://aaa.com', title: 'Alpha',   openedAt: base }),
      tab({ id: '2', url: 'https://bbb.com', title: 'Beta',    openedAt: base + 5 * 60_000 }),
      tab({ id: '3', url: 'https://ccc.com', title: 'Gamma',   openedAt: base + 3 * 60 * 60_000 }),
    ];
    // Use low sensitivity so topic similarity does not interfere
    const { tabs: result } = assignGroups(tabs, 'low');
    expect(result[0].groupId).toBe(result[1].groupId);
    expect(result[0].groupId).not.toBe(result[2].groupId);
  });

  it('labels a single-domain group with the domain name', () => {
    const tabs = [
      tab({ id: '1', url: 'https://github.com/foo', title: 'Foo' }),
      tab({ id: '2', url: 'https://github.com/bar', title: 'Bar' }),
    ];
    const { groups } = assignGroups(tabs, 'medium');
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('github.com');
  });

  it('preserves existing group ids when re-grouping', () => {
    const initial = [tab({ id: '1', url: 'https://github.com/a', title: 'A' })];
    const { tabs: r1, groups: g1 } = assignGroups(initial, 'medium', []);
    const second  = [tab({ id: '2', url: 'https://github.com/b', title: 'B' })];
    const { tabs: r2, groups: g2 } = assignGroups([...r1, ...second], 'medium', g1);
    const githubGroup = g2.find(g => g.label === 'github.com');
    expect(githubGroup?.id).toBe(g1[0].id);
    expect(r2.filter(t => t.groupId === githubGroup!.id)).toHaveLength(2);
  });
});

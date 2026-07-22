import { describe, expect, it } from 'vitest';
import { canonicalUrlKey, filterNewUrls, isArchivableUrl, isIgnoredUrl, normalizeDomain } from '../url';

describe('URL helpers', () => {
  it('normalizes domains entered as hosts or URLs', () => {
    expect(normalizeDomain(' HTTPS://GitHub.COM/some/path ')).toBe('github.com');
    expect(normalizeDomain('*.example.com')).toBe('example.com');
    expect(normalizeDomain('not a domain')).toBe('');
  });

  it('matches ignored domains and their subdomains without matching lookalikes', () => {
    expect(isIgnoredUrl('https://docs.github.com/en', ['github.com'])).toBe(true);
    expect(isIgnoredUrl('https://github.com/', ['github.com'])).toBe(true);
    expect(isIgnoredUrl('https://notgithub.com/', ['github.com'])).toBe(false);
  });

  it('blocks browser and extension pages from archiving', () => {
    expect(isArchivableUrl('chrome://settings')).toBe(false);
    expect(isArchivableUrl('about:config')).toBe(false);
    expect(isArchivableUrl('data:text/plain,hello')).toBe(false);
    expect(isArchivableUrl('https://example.com')).toBe(true);
    expect(isArchivableUrl('file:///C:/notes.txt')).toBe(true);
  });

  it('preserves case-sensitive paths while ignoring fragments', () => {
    expect(canonicalUrlKey('HTTPS://EXAMPLE.COM/Foo#one')).toBe('https://example.com/Foo');
    expect(canonicalUrlKey('https://example.com/foo#two')).toBe('https://example.com/foo');
  });

  it('filters URLs already archived and duplicates in the same batch', () => {
    const items = [
      { url: 'https://example.com/a#one' },
      { url: 'https://example.com/a#two' },
      { url: 'https://example.com/B' },
      { url: 'https://example.com/b' },
    ];
    expect(filterNewUrls(items, ['https://example.com/old'])).toEqual([items[0], items[2], items[3]]);
    expect(filterNewUrls(items, ['https://example.com/a'])).toEqual([items[2], items[3]]);
  });
});

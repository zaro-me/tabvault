const ARCHIVABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:', 'ftp:']);

export function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';

  try {
    const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    return new URL(candidate).hostname.replace(/^\*\./, '').replace(/\.$/, '');
  } catch {
    return '';
  }
}

export function isIgnoredUrl(url: string, ignoredDomains: string[]): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return false;
  }

  return ignoredDomains.some(rawDomain => {
    const domain = normalizeDomain(rawDomain);
    return !!domain && (hostname === domain || hostname.endsWith(`.${domain}`));
  });
}

export function isArchivableUrl(url: string): boolean {
  try {
    return ARCHIVABLE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Normalize only URL parts that are case-insensitive. Paths remain case-sensitive,
 * while fragments are ignored because they point into the same document.
 */
export function canonicalUrlKey(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    url.hash = '';
    return url.href;
  } catch {
    return rawUrl.trim();
  }
}

export function filterNewUrls<T extends { url?: string }>(items: T[], existingUrls: Iterable<string>): T[] {
  const seen = new Set([...existingUrls].map(canonicalUrlKey));
  return items.filter(item => {
    if (!item.url) return false;
    const key = canonicalUrlKey(item.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

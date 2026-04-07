import { v4 as uuidv4 } from 'uuid';
import type { StoredTab, TabGroup } from './types';

// --- Constants ---

const STOP_WORDS = new Set([
  // Articles / conjunctions / prepositions
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
  'her', 'was', 'one', 'our', 'out', 'get', 'has', 'him', 'his',
  'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who',
  'did', 'let', 'put', 'say', 'she', 'too', 'use', 'with', 'from',
  'this', 'that', 'have', 'they', 'will', 'been', 'when', 'what',
  'more', 'also', 'into', 'than', 'then', 'some', 'would', 'about',
  // Web / tech noise
  'com', 'www', 'http', 'https', 'html', 'php', 'asp',
  'page', 'home', 'site', 'web', 'app', 'user', 'info',
  // Generic tech words that add no grouping signal
  'api', 'docs', 'help', 'support', 'login', 'sign', 'guide',
  'blog', 'post', 'read', 'view', 'list', 'search', 'index',
  // Common filler in tab titles
  'update', 'official', 'free', 'best', 'top', 'review',
]);

const SIMILARITY_THRESHOLD: Record<'low' | 'medium' | 'high', number> = {
  low: 0.4,
  medium: 0.25,
  high: 0.15,
};

const TIME_WINDOW_MS = 20 * 60 * 1000; // 20 minutes

/**
 * Maximum tabs to run full O(n²) pairwise TF-IDF comparison on.
 * Beyond this, remaining tabs are assigned greedily to the nearest cluster.
 * Keeps worst-case time at O(CAP² + n·CAP) instead of O(n²).
 */
const TFIDF_CAP = 300;

// --- Text utilities ---

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function getTabTokens(tab: StoredTab): string[] {
  const urlPath = (() => {
    try { return new URL(tab.url).pathname.replace(/\//g, ' '); }
    catch { return ''; }
  })();
  return tokenize(`${tab.title} ${urlPath}`);
}

function topKeywords(tokens: string[], n = 5): string[] {
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t);
}

function inferGroupLabel(tabs: StoredTab[], tokens: string[]): string {
  const domains = [...new Set(tabs.map(t => extractDomain(t.url)))];
  if (domains.length === 1 && domains[0]) return domains[0];
  const kws = topKeywords(tokens, 1);
  return kws[0]
    ? kws[0].charAt(0).toUpperCase() + kws[0].slice(1)
    : 'Uncategorized';
}

// --- TF-IDF ---

function buildTFIDF(tabTokens: string[][]): Map<string, number>[] {
  const N = tabTokens.length;
  const df = new Map<string, number>();
  for (const tokens of tabTokens) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return tabTokens.map(tokens => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const tfidf = new Map<string, number>();
    for (const [t, count] of tf) {
      const idf = Math.log(N / (df.get(t) ?? 1) + 1);
      tfidf.set(t, (count / Math.max(tokens.length, 1)) * idf);
    }
    return tfidf;
  });
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, magA = 0, magB = 0;
  for (const [term, val] of a) {
    dot += val * (b.get(term) ?? 0);
    magA += val * val;
  }
  for (const val of b.values()) magB += val * val;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// --- Union-Find ---

function makeUnionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array<number>(n).fill(0);

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(x: number, y: number): void {
    const rx = find(x), ry = find(y);
    if (rx === ry) return;
    if (rank[rx] < rank[ry]) parent[rx] = ry;
    else if (rank[rx] > rank[ry]) parent[ry] = rx;
    else { parent[ry] = rx; rank[rx]++; }
  }

  return { find, union };
}

// ── Single-tab assignment (used when parking individual tabs) ─────────────────

/**
 * Assigns ONE new tab to an existing group or creates a new group for it.
 * Never re-clusters existing tabs — their group assignments are preserved.
 */
export function assignNewTab(
  newTab: StoredTab,
  existingTabs: StoredTab[],
  existingGroups: TabGroup[],
  sensitivity: 'low' | 'medium' | 'high' = 'medium',
): { tab: StoredTab; groups: TabGroup[] } {
  const threshold = SIMILARITY_THRESHOLD[sensitivity];
  const domain = extractDomain(newTab.url);
  const newTokens = getTabTokens(newTab);

  // Pass 1: exact domain match
  if (domain) {
    for (const group of existingGroups) {
      const groupTabs = existingTabs.filter(t => t.groupId === group.id);
      if (groupTabs.some(t => extractDomain(t.url) === domain)) {
        return mergeIntoGroup(newTab, group, existingGroups);
      }
    }
  }

  // Pass 2: topic similarity against existing tabs
  if (newTokens.length > 0 && existingTabs.length > 0) {
    const allTokenSets = [newTokens, ...existingTabs.map(getTabTokens)];
    const [newVec, ...existingVecs] = buildTFIDF(allTokenSets);

    let bestGroupId: string | null = null;
    let bestSim = threshold;

    existingTabs.forEach((tab, i) => {
      const sim = cosineSimilarity(newVec, existingVecs[i]);
      if (sim > bestSim) {
        bestSim = sim;
        bestGroupId = tab.groupId;
      }
    });

    if (bestGroupId) {
      const group = existingGroups.find(g => g.id === bestGroupId)!;
      return mergeIntoGroup(newTab, group, existingGroups);
    }
  }

  // No match — create a new group
  const newGroup: TabGroup = {
    id: uuidv4(),
    label: inferGroupLabel([newTab], newTokens),
    keywords: [],
    tabIds: [newTab.id],
    createdAt: Date.now(),
  };
  return {
    tab: { ...newTab, groupId: newGroup.id },
    groups: [...existingGroups, newGroup],
  };
}

function mergeIntoGroup(
  tab: StoredTab,
  group: TabGroup,
  allGroups: TabGroup[],
): { tab: StoredTab; groups: TabGroup[] } {
  const updated = { ...group, tabIds: [...group.tabIds, tab.id] };
  return {
    tab: { ...tab, groupId: group.id },
    groups: allGroups.map(g => (g.id === group.id ? updated : g)),
  };
}

// ── Bulk assignment (purge/snapshot/import) ───────────────────────────────────

/**
 * Pure function — assigns every tab to a group using three passes:
 *   1. Domain  — same root domain → same group
 *   2. Topic   — TF-IDF cosine similarity (O(n²) capped at TFIDF_CAP; greedy for the rest)
 *   3. Time    — opened within TIME_WINDOW_MS of each other (fallback)
 *
 * Reuses existing groups when possible; creates new ones otherwise.
 */
export function assignGroups(
  tabs: StoredTab[],
  sensitivity: 'low' | 'medium' | 'high' = 'medium',
  existingGroups: TabGroup[] = [],
): { tabs: StoredTab[]; groups: TabGroup[] } {
  if (tabs.length === 0) return { tabs: [], groups: existingGroups };

  const threshold = SIMILARITY_THRESHOLD[sensitivity];
  const tabsCopy  = tabs.map(t => ({ ...t }));
  const tokenSets = tabsCopy.map(getTabTokens);
  const vectors   = buildTFIDF(tokenSets);
  const { find, union } = makeUnionFind(tabsCopy.length);
  const n = tabsCopy.length;

  // Pass 1: domain clustering — O(n)
  const domainIndex = new Map<string, number[]>();
  tabsCopy.forEach((tab, i) => {
    const d = extractDomain(tab.url);
    if (d) {
      if (!domainIndex.has(d)) domainIndex.set(d, []);
      domainIndex.get(d)!.push(i);
    }
  });
  for (const indices of domainIndex.values()) {
    for (let i = 1; i < indices.length; i++) union(indices[0], indices[i]);
  }

  // Pass 2: TF-IDF topic similarity
  // For n ≤ TFIDF_CAP: full O(n²) pairwise comparison
  // For n > TFIDF_CAP: full pairwise on first TFIDF_CAP, then greedy assignment for the rest
  const cap = Math.min(n, TFIDF_CAP);

  for (let i = 0; i < cap; i++) {
    for (let j = i + 1; j < cap; j++) {
      if (find(i) === find(j)) continue;
      if (cosineSimilarity(vectors[i], vectors[j]) >= threshold) union(i, j);
    }
  }

  if (n > TFIDF_CAP) {
    // Greedily assign overflow tabs to nearest clustered tab
    for (let i = cap; i < n; i++) {
      let bestSim = threshold;
      let bestJ   = -1;
      for (let j = 0; j < cap; j++) {
        const sim = cosineSimilarity(vectors[i], vectors[j]);
        if (sim > bestSim) { bestSim = sim; bestJ = j; }
      }
      if (bestJ !== -1) union(i, bestJ);
    }
  }

  // Pass 3: time proximity fallback
  const byTime = [...tabsCopy.keys()].sort(
    (a, b) => tabsCopy[a].openedAt - tabsCopy[b].openedAt,
  );
  for (let k = 0; k < byTime.length - 1; k++) {
    const i = byTime[k], j = byTime[k + 1];
    if (find(i) === find(j)) continue;
    if (Math.abs(tabsCopy[i].openedAt - tabsCopy[j].openedAt) <= TIME_WINDOW_MS) {
      union(i, j);
    }
  }

  // Build clusters → groups
  const existingGroupMap = new Map(existingGroups.map(g => [g.id, g]));
  const clusters = new Map<number, number[]>();
  tabsCopy.forEach((_, i) => {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(i);
  });

  const resultGroups: TabGroup[] = [];

  for (const indices of clusters.values()) {
    const clusterTabs   = indices.map(i => tabsCopy[i]);
    const clusterTokens = indices.flatMap(i => tokenSets[i]);

    const existingGroupId = clusterTabs.find(
      t => t.groupId && existingGroupMap.has(t.groupId),
    )?.groupId;

    const group: TabGroup = existingGroupId
      ? { ...existingGroupMap.get(existingGroupId)!, tabIds: [] }
      : {
          id: uuidv4(),
          label: inferGroupLabel(clusterTabs, clusterTokens),
          keywords: [], // computed but not currently displayed — skip to save memory
          tabIds: [],
          createdAt: Date.now(),
        };

    for (const i of indices) {
      tabsCopy[i].groupId = group.id;
      group.tabIds.push(tabsCopy[i].id);
    }

    resultGroups.push(group);
  }

  return { tabs: tabsCopy, groups: resultGroups };
}

export interface AITabInput {
  index: number;
  title: string;
  url: string;
}

export interface AIGroup {
  label: string;
  tabIndices: number[];
}

export interface AIGroupSummary {
  id: string;
  label: string;
  /** Short human-readable samples of tabs already in the group */
  tabSamples: string[];
}

export interface AIAssignResult {
  /** Existing group ID to place the tab in, or null to create a new group */
  groupId: string | null;
  /** Label for the new group — only populated when groupId is null */
  newGroupLabel?: string;
}

/**
 * Calls Claude API to decide where a single new tab should go among existing groups.
 * Returns the groupId to assign the tab to, or null + a newGroupLabel if it should
 * get its own new group. Returns null (the whole result) on failure — caller falls
 * back to TF-IDF assignNewTab.
 */
export async function assignTabWithAI(
  tab: AITabInput,
  groups: AIGroupSummary[],
  apiKey: string,
): Promise<AIAssignResult | null> {
  if (!apiKey.trim()) return null;

  const groupList = groups.length > 0
    ? groups.map((g, i) =>
        `${i + 1}. [${g.id}] "${g.label}"\n` +
        (g.tabSamples.length > 0
          ? g.tabSamples.map(s => `   - ${s}`).join('\n')
          : '   (empty group)'),
      ).join('\n')
    : '(no existing groups)';

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: `You are a browser tab organizer. A user just archived a new tab and you must decide where it belongs.

New tab:
"${tab.title}" — ${tab.url}

Existing groups:
${groupList}

Choose the BEST option:
A) Place the tab in an existing group (if it clearly fits one)
B) Create a new group for it (if it doesn't fit any existing group)

Reply with ONLY a JSON object — no explanation:

If placing in an existing group:
{"groupId": "<the exact group ID from the list above>"}

If creating a new group:
{"groupId": null, "newGroupLabel": "Short Specific Label"}

Rules:
- Use an existing group only if the tab genuinely belongs there by topic
- Do NOT use a group just because it's the least-bad option — prefer a new group
- New group labels must be specific (e.g. "Music Production Tools", "FL Studio") not generic ("Misc")
- Reply with raw JSON only, no markdown`,
        }],
      }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  try {
    const data = await response.json() as { content: { text: string }[] };
    const text = data.content?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as { groupId: string | null; newGroupLabel?: string };
    if (typeof parsed.groupId !== 'string' && parsed.groupId !== null) return null;

    // Validate the groupId actually exists (prevent hallucinated IDs)
    if (parsed.groupId !== null && !groups.some(g => g.id === parsed.groupId)) return null;

    return {
      groupId: parsed.groupId,
      newGroupLabel: typeof parsed.newGroupLabel === 'string' ? parsed.newGroupLabel : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Calls Claude API to intelligently group tabs by topic/theme/relevance.
 * Returns null if the API call fails or the response can't be parsed —
 * caller should fall back to TF-IDF grouping.
 */
export async function groupTabsWithAI(
  tabs: AITabInput[],
  apiKey: string,
): Promise<AIGroup[] | null> {
  if (!tabs.length || !apiKey.trim()) return null;

  const tabList = tabs
    .map(t => `${t.index}. "${t.title}" — ${t.url}`)
    .join('\n');

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `You are a browser tab organizer. Group these tabs by topic, theme, and relevance. Be specific and meaningful with group names.

Tabs:
${tabList}

Return ONLY a JSON object — no explanation, no markdown, just the JSON:
{
  "groups": [
    {
      "label": "Descriptive Group Name",
      "tabIndices": [0, 3, 7]
    }
  ]
}

Rules:
- Every index 0–${tabs.length - 1} must appear in exactly one group
- Labels must be specific (e.g. "React Documentation", "Job Search", "Recipe Ideas") not generic ("Misc", "Other")
- Group by topic and content, not just by domain — unless the domain IS the topic
- Aim for meaningful clusters: 3–10 groups depending on content diversity`,
        }],
      }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  try {
    const data = await response.json() as { content: { text: string }[] };
    const text = data.content?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as { groups: AIGroup[] };
    if (!Array.isArray(parsed.groups)) return null;

    // Validate: every index must appear exactly once
    const seen = new Set<number>();
    for (const g of parsed.groups) {
      if (!Array.isArray(g.tabIndices) || typeof g.label !== 'string') return null;
      for (const i of g.tabIndices) {
        if (seen.has(i)) return null; // duplicate
        seen.add(i);
      }
    }
    if (seen.size !== tabs.length) return null;

    return parsed.groups;
  } catch {
    return null;
  }
}

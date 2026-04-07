export interface AITabInput {
  index: number;
  title: string;
  url: string;
}

export interface AIGroup {
  label: string;
  tabIndices: number[];
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

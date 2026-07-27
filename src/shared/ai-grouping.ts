import { detectAIProvider, type AIProvider } from './ai-provider';

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
  /** Label for the new group - only populated when groupId is null */
  newGroupLabel?: string;
}

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const OPENAI_MODEL = 'gpt-5.4-mini';

type JsonObject = Record<string, unknown>;

const ASSIGNMENT_SCHEMA: JsonObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    groupId: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    newGroupLabel: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
  },
  required: ['groupId', 'newGroupLabel'],
};

const GROUPING_SCHEMA: JsonObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          tabIndices: {
            type: 'array',
            items: { type: 'integer' },
          },
        },
        required: ['label', 'tabIndices'],
      },
    },
  },
  required: ['groups'],
};

/**
 * Calls the detected AI provider to decide where a single new tab should go.
 * Returns the groupId to assign the tab to, or null + a newGroupLabel if it
 * should get its own new group. Returns null (the whole result) on failure -
 * caller falls back to TF-IDF assignNewTab.
 */
export async function assignTabWithAI(
  tab: AITabInput,
  groups: AIGroupSummary[],
  apiKey: string,
): Promise<AIAssignResult | null> {
  const provider = detectAIProvider(apiKey);
  if (!provider) return null;

  const prompt = buildAssignmentPrompt(tab, groups);
  const text = await requestAIText(provider, apiKey, prompt, {
    maxTokens: 512,
    schemaName: 'tab_group_assignment',
    schema: ASSIGNMENT_SCHEMA,
  });
  if (!text) return null;

  return parseAssignmentResult(text, groups);
}

/**
 * Calls the detected AI provider to intelligently group tabs by topic/theme.
 * Returns null if the API call fails or the response can't be parsed - caller
 * should fall back to TF-IDF grouping.
 */
export async function groupTabsWithAI(
  tabs: AITabInput[],
  apiKey: string,
): Promise<AIGroup[] | null> {
  if (!tabs.length) return null;

  const provider = detectAIProvider(apiKey);
  if (!provider) return null;

  const prompt = buildGroupingPrompt(tabs);
  const text = await requestAIText(provider, apiKey, prompt, {
    maxTokens: 8192,
    schemaName: 'tab_groups',
    schema: GROUPING_SCHEMA,
  });
  if (!text) throw new Error(`${providerLabel(provider)} returned an empty response`);

  const result = parseGroupingResult(text, tabs.length);
  if (!result) {
    throw new Error(`${providerLabel(provider)} returned an invalid tab organization. Please try again.`);
  }
  return result;
}

function buildAssignmentPrompt(tab: AITabInput, groups: AIGroupSummary[]): string {
  const groupList = groups.length > 0
    ? groups.map((g, i) =>
        `${i + 1}. [${g.id}] "${g.label}"\n` +
        (g.tabSamples.length > 0
          ? g.tabSamples.map(s => `   - ${s}`).join('\n')
          : '   (empty group)'),
      ).join('\n')
    : '(no existing groups)';

  return `You are a browser tab organizer. A user just archived a new tab and you must decide where it belongs.

New tab:
"${tab.title}" - ${tab.url}

Existing groups:
${groupList}

Choose the BEST option:
A) Place the tab in an existing group (if it clearly fits one)
B) Create a new group for it (if it doesn't fit any existing group)

Return ONLY a JSON object:

If placing in an existing group:
{"groupId": "<the exact group ID from the list above>", "newGroupLabel": null}

If creating a new group:
{"groupId": null, "newGroupLabel": "Short Specific Label"}

Rules:
- Use an existing group only if the tab genuinely belongs there by topic
- Do NOT use a group just because it's the least-bad option - prefer a new group
- New group labels must be specific (e.g. "Music Production Tools", "FL Studio") not generic ("Misc")
- Reply with raw JSON only, no markdown`;
}

function buildGroupingPrompt(tabs: AITabInput[]): string {
  const tabList = tabs
    .map(t => `${t.index}. "${t.title}" - ${t.url}`)
    .join('\n');

  return `You are a browser tab organizer. Group these tabs by topic, theme, and relevance. Be specific and meaningful with group names.

Tabs:
${tabList}

Return ONLY a JSON object:
{
  "groups": [
    {
      "label": "Descriptive Group Name",
      "tabIndices": [0, 3, 7]
    }
  ]
}

Rules:
- Every index 0-${tabs.length - 1} must appear in exactly one group
- Labels must be specific (e.g. "React Documentation", "Job Search", "Recipe Ideas") not generic ("Misc", "Other")
- Group by topic and content, not just by domain - unless the domain IS the topic
- Aim for meaningful clusters: 3-10 groups depending on content diversity
- Reply with raw JSON only, no markdown`;
}

async function requestAIText(
  provider: AIProvider,
  apiKey: string,
  prompt: string,
  options: { maxTokens: number; schemaName: string; schema: JsonObject },
): Promise<string | null> {
  if (provider === 'anthropic') {
    return requestAnthropicText(apiKey, prompt, options);
  }

  return requestOpenAIText(apiKey, prompt, options);
}

async function requestAnthropicText(
  apiKey: string,
  prompt: string,
  options: { maxTokens: number; schemaName: string; schema: JsonObject },
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Anthropic requires this opt-in header for calls made directly from
        // browser and extension contexts.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: options.maxTokens,
        messages: [{
          role: 'user',
          content: prompt,
        }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: options.schema,
          },
        },
      }),
    });
  } catch (error) {
    throw connectionError('Anthropic Claude', error);
  }

  const data = await readResponseJson(response, 'Anthropic Claude');
  if (!response.ok) throw apiResponseError('Anthropic Claude', response, data);
  assertCompleteAnthropicResponse(data);
  return extractAnthropicText(data);
}

async function requestOpenAIText(
  apiKey: string,
  prompt: string,
  options: { maxTokens: number; schemaName: string; schema: JsonObject },
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt,
        max_output_tokens: options.maxTokens,
        text: {
          format: {
            type: 'json_schema',
            name: options.schemaName,
            schema: options.schema,
            strict: true,
          },
        },
      }),
    });
  } catch (error) {
    throw connectionError('OpenAI', error);
  }

  const data = await readResponseJson(response, 'OpenAI');
  if (!response.ok) throw apiResponseError('OpenAI', response, data);
  return extractOpenAIText(data);
}

async function readResponseJson(response: Response, provider: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`${provider} returned a response that TabVault could not read`);
  }
}

function connectionError(provider: string, error: unknown): Error {
  const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
  return new Error(`Could not reach ${provider}. Check your connection and try again${detail}`);
}

function apiResponseError(provider: string, response: Response, data: unknown): Error {
  const message = extractApiErrorMessage(data) ?? response.statusText ?? 'Request failed';
  const requestId = response.headers?.get?.('request-id');
  const requestSuffix = requestId ? ` [request ${requestId}]` : '';
  return new Error(`${provider} API error ${response.status}: ${message}${requestSuffix}`);
}

function extractApiErrorMessage(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const error = data.error;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  if (typeof data.message === 'string') return data.message;
  return null;
}

function assertCompleteAnthropicResponse(data: unknown): void {
  if (!isRecord(data)) return;
  if (data.stop_reason === 'max_tokens' || data.stop_reason === 'model_context_window_exceeded') {
    throw new Error('Anthropic Claude ran out of response space before finishing the organization. Try again with fewer saved tabs.');
  }
  if (data.stop_reason === 'refusal') {
    throw new Error('Anthropic Claude declined to organize these tabs');
  }
}

function providerLabel(provider: AIProvider): string {
  return provider === 'anthropic' ? 'Anthropic Claude' : 'OpenAI';
}

function extractAnthropicText(data: unknown): string | null {
  if (!isRecord(data) || !Array.isArray(data.content)) return null;

  for (const part of data.content) {
    if (isRecord(part) && typeof part.text === 'string') return part.text;
  }

  return null;
}

function extractOpenAIText(data: unknown): string | null {
  if (!isRecord(data)) return null;
  if (typeof data.output_text === 'string') return data.output_text;
  if (!Array.isArray(data.output)) return null;

  const parts: string[] = [];
  for (const item of data.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === 'string') parts.push(content.text);
    }
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

function parseAssignmentResult(text: string, groups: AIGroupSummary[]): AIAssignResult | null {
  const parsed = parseJsonFromText(text);
  if (!isRecord(parsed)) return null;

  const rawGroupId = parsed.groupId;
  if (typeof rawGroupId !== 'string' && rawGroupId !== null) return null;

  if (rawGroupId !== null && !groups.some(g => g.id === rawGroupId)) return null;

  const rawLabel = parsed.newGroupLabel;
  const newGroupLabel = typeof rawLabel === 'string' ? rawLabel.trim() : undefined;

  return {
    groupId: rawGroupId,
    newGroupLabel: newGroupLabel || undefined,
  };
}

function parseGroupingResult(text: string, tabCount: number): AIGroup[] | null {
  const parsed = parseJsonFromText(text);
  if (!isRecord(parsed) || !Array.isArray(parsed.groups)) return null;

  const groups: AIGroup[] = [];
  const seen = new Set<number>();

  for (const group of parsed.groups) {
    if (!isRecord(group) || typeof group.label !== 'string' || !Array.isArray(group.tabIndices)) return null;

    const label = group.label.trim();
    if (!label) return null;

    const tabIndices: number[] = [];
    for (const index of group.tabIndices) {
      if (!Number.isInteger(index) || index < 0 || index >= tabCount || seen.has(index)) return null;
      seen.add(index);
      tabIndices.push(index);
    }

    if (tabIndices.length > 0) groups.push({ label, tabIndices });
  }

  if (seen.size !== tabCount) return null;
  return groups;
}

function parseJsonFromText(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { assignTabWithAI, groupTabsWithAI } from '../ai-grouping';

describe('ai-grouping provider routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes OpenAI keys to the Responses API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          groups: [{ label: 'OpenAI Docs', tabIndices: [0] }],
        }),
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await groupTabsWithAI([
      { index: 0, title: 'Responses API', url: 'https://platform.openai.com/docs' },
    ], 'sk-proj-test');

    expect(result).toEqual([{ label: 'OpenAI Docs', tabIndices: [0] }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-proj-test' }),
      }),
    );
  });

  it('routes Anthropic keys to Claude messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify({ groupId: 'group-1', newGroupLabel: null }) }],
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await assignTabWithAI(
      { index: 0, title: 'Claude Docs', url: 'https://docs.anthropic.com' },
      [{ id: 'group-1', label: 'AI Docs', tabSamples: ['Claude Docs - anthropic.com'] }],
      'sk-ant-test',
    );

    expect(result).toEqual({ groupId: 'group-1', newGroupLabel: undefined });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test',
          'anthropic-dangerous-direct-browser-access': 'true',
        }),
      }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string) as {
      output_config?: { format?: { type?: string; schema?: unknown } };
    };
    expect(body.output_config?.format?.type).toBe('json_schema');
    expect(body.output_config?.format?.schema).toBeTruthy();
  });

  it('surfaces Anthropic API errors instead of reporting invalid organization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: { get: () => 'req_test_123' },
      json: async () => ({
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(groupTabsWithAI([
      { index: 0, title: 'Claude Docs', url: 'https://docs.anthropic.com' },
    ], 'sk-ant-test')).rejects.toThrow(
      'Anthropic Claude API error 401: invalid x-api-key [request req_test_123]',
    );
  });

  it('reports a truncated Anthropic organization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        stop_reason: 'max_tokens',
        content: [{ type: 'text', text: '{"groups": [' }],
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(groupTabsWithAI([
      { index: 0, title: 'Claude Docs', url: 'https://docs.anthropic.com' },
    ], 'sk-ant-test')).rejects.toThrow('ran out of response space');
  });

  it('keeps every tab when Anthropic omits an index from an otherwise valid organization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        stop_reason: 'end_turn',
        content: [{
          type: 'text',
          text: JSON.stringify({
            groups: [{ label: 'AI Docs', tabIndices: [0, 2] }],
          }),
        }],
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await groupTabsWithAI([
      { index: 0, title: 'Claude Docs', url: 'https://docs.anthropic.com' },
      { index: 1, title: 'Vite Docs', url: 'https://vite.dev' },
      { index: 2, title: 'OpenAI Docs', url: 'https://platform.openai.com/docs' },
    ], 'sk-ant-test');

    expect(result).toEqual([
      { label: 'AI Docs', tabIndices: [0, 2] },
      { label: 'Unsorted', tabIndices: [1] },
    ]);
  });

  it('uses the first assignment when Anthropic duplicates a tab index', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        stop_reason: 'end_turn',
        content: [{
          type: 'text',
          text: JSON.stringify({
            groups: [
              { label: 'AI Docs', tabIndices: [0, 1] },
              { label: 'Build Tools', tabIndices: [1, 2] },
            ],
          }),
        }],
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await groupTabsWithAI([
      { index: 0, title: 'Claude Docs', url: 'https://docs.anthropic.com' },
      { index: 1, title: 'OpenAI Docs', url: 'https://platform.openai.com/docs' },
      { index: 2, title: 'Vite Docs', url: 'https://vite.dev' },
    ], 'sk-ant-test');

    expect(result).toEqual([
      { label: 'AI Docs', tabIndices: [0, 1] },
      { label: 'Build Tools', tabIndices: [2] },
    ]);
  });
});

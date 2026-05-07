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
        headers: expect.objectContaining({ 'x-api-key': 'sk-ant-test' }),
      }),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { detectAIProvider } from '../ai-provider';

describe('detectAIProvider', () => {
  it('detects Anthropic keys', () => {
    expect(detectAIProvider('sk-ant-api03-example')).toBe('anthropic');
  });

  it('detects OpenAI keys', () => {
    expect(detectAIProvider('sk-proj-example')).toBe('openai');
    expect(detectAIProvider('sk-svcacct-example')).toBe('openai');
    expect(detectAIProvider('sk-example')).toBe('openai');
  });

  it('rejects empty and unsupported keys', () => {
    expect(detectAIProvider('')).toBeNull();
    expect(detectAIProvider('   ')).toBeNull();
    expect(detectAIProvider('not-a-key')).toBeNull();
  });
});

export type AIProvider = 'anthropic' | 'openai';

export const AI_PROVIDER_LABEL: Record<AIProvider, string> = {
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI',
};

export function detectAIProvider(apiKey?: string): AIProvider | null {
  const key = apiKey?.trim();
  if (!key) return null;

  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-')) return 'openai';

  return null;
}

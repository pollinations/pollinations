/**
 * Available Pollinations language (text) model IDs
 * Based on: https://gen.pollinations.ai/v1/models
 */
export type PollinationsLanguageModelId =
  | 'openai'
  | 'openai-fast'
  | 'openai-large'
  | 'openai-audio'
  | 'gemini'
  | 'gemini-fast'
  | 'gemini-large'
  | 'gemini-search'
  | 'claude'
  | 'claude-fast'
  | 'claude-large'
  | 'mistral'
  | 'deepseek'
  | 'grok'
  | 'perplexity-fast'
  | 'perplexity-reasoning'
  | 'qwen-coder'
  | 'kimi'
  | 'nova-fast'
  | 'glm'
  | 'minimax'
  | 'chickytutor'
  | 'midijourney'
  | string;

import OpenAIProvider from './providers/openai-like';
import { BaseProvider } from './base-provider';

export type LLMProviderName = 'openai';

export const llmProviders = new Map<LLMProviderName, BaseProvider>();

/**
 * Register all available LLM providers.
 * Each provider must implement the BaseProvider interface.
 */
export function registerProviders() {
  llmProviders.set('openai', new OpenAIProvider());
}

/**
 * Get a provider by name.
 * Returns undefined if the provider is not found.
 */
export function getProvider(name: LLMProviderName) {
  return llmProviders.get(name);
}

// Export the provider class for dynamic loading
export { OpenAIProvider };

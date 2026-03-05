import { ImageModelV3, ProviderV3, SpeechModelV3 } from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { PollinationsImageModel, PollinationsImageModelId } from './image';
import {
  PollinationsLanguageModel,
  PollinationsLanguageModelId,
} from './language';
import {
  API_ENDPOINTS,
  API_KEY_PARAMS,
  DEFAULT_CONFIG,
  EXTERNAL_URLS,
  LEGACY_API_ENDPOINTS,
} from './pollinations-constants';
import type {
  PollinationsImageModelSettings,
  PollinationsLanguageModelSettings,
} from './pollinations-types';
import { PollinationsSpeechModel, PollinationsSpeechModelId } from './speech';

export interface PollinationsProvider extends ProviderV3 {
  (modelId: string): PollinationsLanguageModel;

  /**
   * Creates a Pollinations model for text generation.
   */
  languageModel(
    modelId: PollinationsLanguageModelId,
    settings?: PollinationsLanguageModelSettings,
  ): PollinationsLanguageModel;

  /**
   * Creates a Pollinations model for text generation.
   */
  chat(
    modelId: PollinationsLanguageModelId,
    settings?: PollinationsLanguageModelSettings,
  ): PollinationsLanguageModel;

  /**
   * Creates a Pollinations model for image generation.
   */
  imageModel(
    modelId: PollinationsImageModelId,
    settings?: PollinationsImageModelSettings,
  ): ImageModelV3;

  /**
   * Creates a Pollinations model for image generation.
   */
  image(
    modelId: PollinationsImageModelId,
    settings?: PollinationsImageModelSettings,
  ): ImageModelV3;

  /**
   * Creates a Pollinations model for speech/audio generation.
   */
  speechModel(modelId: PollinationsSpeechModelId): SpeechModelV3;

  /**
   * Creates a Pollinations model for speech/audio generation.
   */
  audio(modelId: PollinationsSpeechModelId): SpeechModelV3;
}

export interface PollinationsProviderSettings {
  /**
   * API key for authenticating requests (optional).
   * Get one at: {@link EXTERNAL_URLS.AUTH}
   */
  apiKey?: string;

  /**
   * Base URL for API calls.
   * @default See {@link LEGACY_API_ENDPOINTS.LANGUAGE} for legacy, {@link API_ENDPOINTS.LANGUAGE} for new
   */
  baseURL?: string;

  /**
   * Base URL for image generation API calls.
   * @default See {@link LEGACY_API_ENDPOINTS.IMAGE_BASE} for legacy, {@link API_ENDPOINTS.IMAGE} for new
   */
  imageURL?: string;

  /**
   * Referrer identifier for analytics (optional).
   */
  referrer?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Provider name. Overrides the `pollinations` default name.
   */
  name?: string;

  /**
   * Custom fetch implementation.
   *
   * You can use this to:
   * - Add custom request/response interceptors
   * - Use a different fetch implementation (e.g., node-fetch, undici)
   * - Add retries or custom error handling
   * - Mock fetch for testing
   *
   * @default globalThis.fetch
   */
  fetch?: FetchFunction;

  /**
   * Whether to use legacy Pollinations API URLs.
   *
   * When `false` (default), uses the new unified API endpoints:
   * - Language models: {@link API_ENDPOINTS.LANGUAGE}
   * - Image models: {@link API_ENDPOINTS.IMAGE}
   * - API key parameter: {@link API_KEY_PARAMS.NEW} (in query string)
   *
   * When `true`, uses legacy API endpoints:
   * - Language models: {@link LEGACY_API_ENDPOINTS.LANGUAGE}
   * - Image models: {@link LEGACY_API_ENDPOINTS.IMAGE}
   * - API key parameter: {@link API_KEY_PARAMS.LEGACY} (in query string)
   *
   * **When to use legacy URLs:**
   * - Existing integrations that depend on legacy endpoints
   * - Backward compatibility with older API versions
   * - Testing or migration scenarios
   *
   * **Recommendation:** Use the default (`false`) for new projects as the new
   * unified API provides better consistency and future-proofing.
   *
   * @default false
   */
  useLegacyUrls?: boolean;
}

// Internal config for the language model
export interface PollinationsConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string>;
  queryParams: () => Record<string, string>;
  generateId: () => string;
  fetch?: FetchFunction;
  referrer?: string;
}

/**
 * Create a Pollinations provider instance.
 */
export function createPollinations(
  options: PollinationsProviderSettings = {},
): PollinationsProvider {
  const apiKey = options.apiKey ?? process.env[DEFAULT_CONFIG.API_KEY_ENV_VAR];
  const providerName = options.name ?? DEFAULT_CONFIG.PROVIDER_NAME;

  const getHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': DEFAULT_CONFIG.CONTENT_TYPE,
      ...options.headers,
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    if (options.referrer) {
      headers['Referer'] = options.referrer;
    }
    return headers;
  };

  const getQueryParams = () => {
    const params: Record<string, string> = {};
    if (apiKey) {
      if (options.useLegacyUrls) {
        params[API_KEY_PARAMS.LEGACY] = apiKey;
      } else {
        params[API_KEY_PARAMS.NEW] = apiKey;
      }
    }
    return params;
  };

  const languageModelBaseUrl =
    withoutTrailingSlash(options.baseURL) ??
    (options.useLegacyUrls
      ? LEGACY_API_ENDPOINTS.LANGUAGE
      : API_ENDPOINTS.LANGUAGE);

  const createLanguageModel = (
    modelId: string,
    settings: PollinationsLanguageModelSettings = {},
  ) =>
    new PollinationsLanguageModel(modelId, settings, {
      provider: providerName,
      baseURL: languageModelBaseUrl,
      headers: getHeaders,
      queryParams: getQueryParams,
      generateId: generateId,
      fetch: options.fetch,
      referrer: options.referrer,
    });

  const imageBaseURL =
    withoutTrailingSlash(options.imageURL) ??
    (options.useLegacyUrls ? LEGACY_API_ENDPOINTS.IMAGE : API_ENDPOINTS.IMAGE);

  const createImageModel = (
    modelId: PollinationsImageModelId,
    settings: PollinationsImageModelSettings = {},
  ) =>
    new PollinationsImageModel(modelId, settings, {
      provider: `${providerName}.image`,
      baseURL: imageBaseURL,
      headers: getHeaders,
      queryParams: getQueryParams,
      generateId: generateId,
      fetch: options.fetch,
      referrer: options.referrer,
    });

  const createSpeechModel = (modelId: PollinationsSpeechModelId) =>
    new PollinationsSpeechModel(modelId, {
      provider: `${providerName}.speech`,
      baseURL: languageModelBaseUrl,
      headers: getHeaders,
      queryParams: getQueryParams,
      generateId: generateId,
      fetch: options.fetch,
      referrer: options.referrer,
    });

  const provider = function (modelId: string) {
    if (new.target) {
      throw new Error(
        'The Pollinations model function cannot be called with the new keyword.',
      );
    }

    return createLanguageModel(modelId);
  };

  // Set provider properties
  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.imageModel = createImageModel;
  provider.image = createImageModel;
  provider.speechModel = createSpeechModel;
  provider.speech = createSpeechModel;

  return provider as any as PollinationsProvider;
}

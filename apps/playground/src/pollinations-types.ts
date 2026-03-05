/**
 * Types for Pollinations API
 */

/**
 * Language model settings that can be passed when creating a language model
 * or via providerOptions.pollinations (providerOptions take precedence)
 */
export interface PollinationsLanguageModelSettings {
  /** Request log probabilities */
  logprobs?: boolean;
  /** Number of top log probabilities to return */
  top_logprobs?: number;
  /** Enable parallel tool calls */
  parallel_tool_calls?: boolean;
  /** User identifier for tracking */
  user?: string;
  /** Modalities to use (e.g., ['text', 'audio']) */
  modalities?: string[];
  /** Audio output configuration */
  audio?: {
    voice?: string;
    format?: string;
  };
  /** Repetition penalty (alternative to frequency_penalty) */
  repetition_penalty?: number;
  /** Logit bias to modify token likelihood */
  logit_bias?: Record<string, number>;
  /** Streaming options */
  stream_options?: {
    include_usage?: boolean;
  };
  /** Thinking configuration for reasoning models */
  thinking?: {
    type?: 'enabled' | 'disabled';
    budget_tokens?: number;
  };
  /** Reasoning effort level */
  reasoning_effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  /** Thinking budget (alternative to thinking.budget_tokens) */
  thinking_budget?: number;
  /** Additional options are allowed for future API updates */
  [key: string]: unknown;
}

/**
 * Image model settings that can be passed when creating an image model
 * or via providerOptions.pollinations (providerOptions take precedence)
 */
export interface PollinationsImageModelSettings {
  /**
   * Remove Pollinations logo from generated images.
   * @default false
   */
  nologo?: boolean;

  /**
   * Enhance image quality.
   * @default false
   */
  enhance?: boolean;

  /**
   * Make image private (not shown in public feed).
   * @default false
   */
  private?: boolean;
}

/**
 * Response types for Pollinations API
 */

export interface PollinationsResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  /**
   * Optional list of citation URLs returned by the model (e.g. Perplexity-style responses).
   */
  citations?: string[];
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
      annotations?: Array<{
        url_citation?: { url?: string; title?: string | null };
      }>;
    };
    finish_reason: string | null;
    /**
     * Optional grounding metadata for models that provide grounded answers
     * (e.g. Google / Vertex-style responses).
     *
     * This is intentionally loosely typed and focused on the fields we use for
     * extracting sources.
     */
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: {
          uri?: string | null;
          title?: string | null;
          domain?: string | null;
        } | null;
        retrievedContext?: {
          uri?: string | null;
          title?: string | null;
          text?: string | null;
          fileSearchStore?: string | null;
        } | null;
        maps?: {
          uri?: string | null;
          title?: string | null;
          text?: string | null;
          placeId?: string | null;
        } | null;
      }>;
    } | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
      audio_tokens?: number;
    };
    prompt_tokens_details?: {
      cached_tokens?: number;
      audio_tokens?: number;
    };
  };
}

export interface PollinationsStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  /**
   * Optional list of citation URLs returned by the model (e.g. Perplexity-style responses).
   */
  citations?: string[];
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
      annotations?: Array<{
        url_citation?: { url?: string; title?: string | null };
      }>;
    };
    finish_reason?: string | null;
    groundingMetadata?: PollinationsResponse['choices'][number]['groundingMetadata'];
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
      audio_tokens?: number;
    };
    prompt_tokens_details?: {
      cached_tokens?: number;
      audio_tokens?: number;
    };
  };
}

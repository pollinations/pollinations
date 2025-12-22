// ============================================================================
// Pollinations SDK Types
// Complete TypeScript definitions for the Pollinations AI API
// ============================================================================

// ============================================================================
// Configuration
// ============================================================================

export interface PollinationsConfig {
  /** API key for authentication (get one at https://enter.pollinations.ai) */
  apiKey?: string;
  /** Base URL for the API (defaults to https://gen.pollinations.ai) */
  baseUrl?: string;
}

// ============================================================================
// Image Generation
// ============================================================================

/** Image model (use getImageModels() to fetch available models) */
export type ImageModel = string;

/** Available video models */
export type VideoModel = string;

/** Image quality options */
export type ImageQuality = 'low' | 'medium' | 'high' | 'hd';

/** Options for image generation */
export interface ImageGenerateOptions {
  /** Image model to use (default: 'flux') */
  model?: ImageModel;
  /** Image width in pixels (default: 1024) */
  width?: number;
  /** Image height in pixels (default: 1024) */
  height?: number;
  /** Seed for reproducible generation (default: random) */
  seed?: number;
  /** Let AI enhance/improve your prompt (default: false) */
  enhance?: boolean;
  /** Negative prompt - what to avoid in the image */
  negativePrompt?: string;
  /** Keep generation private (default: false) */
  private?: boolean;
  /** Remove watermark logo (default: false) */
  nologo?: boolean;
  /** Don't show in public feed (default: false) */
  nofeed?: boolean;
  /** Enable safety content filters (default: false) */
  safe?: boolean;
  /** Output quality (default: 'medium') */
  quality?: ImageQuality;
  /** Reference image URL(s) for image-to-image generation */
  referenceImage?: string | string[];
  /** Enable transparent background - outputs PNG (default: false) */
  transparent?: boolean;
  /** How closely to follow prompt, 1-20 (higher = stricter) */
  guidanceScale?: number;
}

/** Response from image generation */
export interface ImageResponse {
  /** The generated image as a Buffer (Node.js) or ArrayBuffer (browser) */
  buffer: ArrayBuffer;
  /** Content type (image/jpeg or image/png) */
  contentType: string;
  /** The URL that was used to generate the image */
  url: string;
}

// ============================================================================
// Video Generation
// ============================================================================

/** Options for video generation */
export interface VideoGenerateOptions {
  /** Video model to use (default: 'veo') */
  model?: VideoModel;
  /** Duration in seconds (veo: 4,6,8; seedance: 2-10) */
  duration?: number;
  /** Aspect ratio (e.g., '16:9', '9:16', '1:1') */
  aspectRatio?: string;
  /** Seed for reproducible generation */
  seed?: number;
  /** Enable audio generation - veo only (default: false) */
  audio?: boolean;
  /** Reference image URL(s) for image-to-video */
  referenceImage?: string | string[];
  /** Keep generation private (default: false) */
  private?: boolean;
  /** Remove watermark logo (default: false) */
  nologo?: boolean;
  /** Enable safety content filters (default: false) */
  safe?: boolean;
}

/** Response from video generation */
export interface VideoResponse {
  /** The generated video as a Buffer (Node.js) or ArrayBuffer (browser) */
  buffer: ArrayBuffer;
  /** Content type (video/mp4) */
  contentType: string;
  /** The URL that was used to generate the video */
  url: string;
}

// ============================================================================
// Text Generation
// ============================================================================

/** Text model (use getTextModels() to fetch available models) */
export type TextModel = string;

/** Message roles for chat */
export type MessageRole = 'system' | 'developer' | 'user' | 'assistant' | 'tool' | 'function';

/** Text content part */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/** Image content part for vision */
export interface ImageContentPart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
    mime_type?: string;
  };
}

/** Video content part */
export interface VideoContentPart {
  type: 'video_url';
  video_url: {
    url: string;
    mime_type?: string;
  };
}

/** Audio content part */
export interface AudioContentPart {
  type: 'input_audio';
  input_audio: {
    /** Base64 encoded audio data */
    data: string;
    format: 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16';
  };
}

/** File content part */
export interface FileContentPart {
  type: 'file';
  file: {
    file_data?: string;
    file_id?: string;
    file_name?: string;
    file_url?: string;
    mime_type?: string;
  };
}

/** All possible content parts */
export type MessageContentPart =
  | TextContentPart
  | ImageContentPart
  | VideoContentPart
  | AudioContentPart
  | FileContentPart;

/** Message content - either a string or array of content parts */
export type MessageContent = string | MessageContentPart[];

/** A chat message */
export interface Message {
  role: MessageRole;
  content: MessageContent;
  name?: string;
  /** For tool messages */
  tool_call_id?: string;
}

/** Options for simple text generation */
export interface TextGenerateOptions {
  /** Text model to use (default: 'openai') */
  model?: TextModel;
  /** System prompt to set context */
  systemPrompt?: string;
  /** Seed for reproducible generation */
  seed?: number;
  /** Return response as JSON (default: false) */
  json?: boolean;
  /** Temperature 0-2, higher = more creative (default: 1) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Frequency penalty -2 to 2 */
  frequencyPenalty?: number;
  /** Presence penalty -2 to 2 */
  presencePenalty?: number;
  /** Enable streaming response (default: false) */
  stream?: boolean;
  /** Keep generation private (default: false) */
  private?: boolean;
}

/** Response format options */
export type ResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: JsonSchema };

/** JSON schema for structured output */
export interface JsonSchema {
  name: string;
  description?: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

/** Tool definition */
export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
}

/** Built-in tool types */
export type BuiltInToolType =
  | 'code_execution'
  | 'google_search'
  | 'google_maps'
  | 'url_context'
  | 'computer_use'
  | 'file_search';

/** Thinking/reasoning options */
export interface ThinkingOptions {
  type: 'enabled' | 'disabled';
  budget_tokens?: number;
}

/** Options for chat completions (POST endpoint) */
export interface ChatOptions {
  /** Text model to use (default: 'openai') */
  model?: TextModel;
  /** Temperature 0-2 (default: 1) */
  temperature?: number;
  /** Top P sampling 0-1 (default: 1) */
  topP?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Frequency penalty -2 to 2 */
  frequencyPenalty?: number;
  /** Presence penalty -2 to 2 */
  presencePenalty?: number;
  /** Repetition penalty */
  repetitionPenalty?: number;
  /** Stop sequences (max 4) */
  stop?: string | string[];
  /** Seed for reproducible generation */
  seed?: number;
  /** Enable streaming response (default: false) */
  stream?: boolean;
  /** Include usage stats in streaming response */
  streamOptions?: { include_usage?: boolean };
  /** Response format */
  responseFormat?: ResponseFormat;
  /** Tools available to the model */
  tools?: (Tool | { type: BuiltInToolType })[];
  /** Tool choice: 'none', 'auto', 'required', or specific function */
  toolChoice?: 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };
  /** Allow parallel tool calls (default: true) */
  parallelToolCalls?: boolean;
  /** Enable thinking/reasoning for supported models */
  thinking?: ThinkingOptions | null;
  /** Reasoning effort for thinking models */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Thinking budget in tokens */
  thinkingBudget?: number;
  /** Output modalities */
  modalities?: ('text' | 'audio')[];
  /** Audio output options */
  audio?: {
    voice?: AudioVoice;
    format?: AudioFormat;
  };
  /** User identifier for tracking */
  user?: string;
  /** Logit bias for token probabilities */
  logitBias?: Record<string, number>;
  /** Return log probabilities */
  logprobs?: boolean;
  /** Number of top log probabilities to return (0-20) */
  topLogprobs?: number;
  /** Legacy function calling (use tools instead) */
  functions?: FunctionDefinition[];
  /** Legacy function call control (use toolChoice instead) */
  functionCall?: 'none' | 'auto' | { name: string };
}

/** Legacy function definition (use Tool instead) */
export interface FunctionDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

/** A tool call in the response */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** Token usage information */
export interface CompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
    audio_tokens?: number;
  };
}

/** A choice in the chat response */
export interface ChatChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: ToolCall[];
    audio?: {
      transcript: string;
      data: string;
      id: string;
      expires_at: number;
    } | null;
    reasoning_content?: string | null;
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: {
    content?: Array<{
      token: string;
      logprob: number;
      bytes?: number[];
      top_logprobs?: Array<{ token: string; logprob: number; bytes?: number[] }>;
    }>;
  } | null;
}

/** Chat completion response */
export interface ChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatChoice[];
  usage?: CompletionUsage;
  system_fingerprint?: string;
  citations?: string[];
}

/** A chunk in streaming response */
export interface ChatStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }>;
  usage?: CompletionUsage;
}

// ============================================================================
// Audio Generation
// ============================================================================

/** Voice option for audio generation */
export type AudioVoice = string;

/** Audio format options */
export type AudioFormat = 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16';

/** Options for audio generation */
export interface AudioGenerateOptions {
  /** Voice to use (default: 'alloy') */
  voice?: AudioVoice;
  /** Model to use (default: 'openai-audio') */
  model?: TextModel;
  /** Output format */
  format?: AudioFormat;
  /** Seed for reproducibility */
  seed?: number;
}

/** Audio response from chat with audio modality */
export interface AudioResponse {
  /** Transcript of the audio */
  transcript: string;
  /** Base64 encoded audio data */
  data: string;
  /** Audio ID */
  id: string;
  /** Expiration timestamp */
  expiresAt: number;
}

// ============================================================================
// Model Information
// ============================================================================

/** Model tier levels */
export type ModelTier = 'anonymous' | 'seed' | 'flower' | 'nectar';

/** Model information */
export interface ModelInfo {
  name: string;
  description?: string;
  aliases?: string[];
  tier?: ModelTier;
  community?: boolean;
  input_modalities?: string[];
  output_modalities?: string[];
  tools?: boolean;
  vision?: boolean;
  audio?: boolean;
  reasoning?: boolean;
  uncensored?: boolean;
  voices?: string[];
  maxInputChars?: number;
  context_window?: number;
  supportsSystemMessages?: boolean;
  is_specialized?: boolean;
  pricing?: {
    currency: 'pollen';
    input_token_price?: number;
    output_token_price?: number;
    cached_token_price?: number;
    image_price?: number;
    audio_input_price?: number;
    audio_output_price?: number;
  };
}

// ============================================================================
// Error Types
// ============================================================================

/** API error details */
export interface PollinationsErrorDetails {
  code: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'INTERNAL_ERROR' | string;
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
  requestId?: string;
  cause?: unknown;
}

/** Pollinations SDK Error */
export class PollinationsError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  requestId?: string;

  constructor(
    message: string,
    code: string,
    status: number,
    details?: Record<string, unknown>,
    requestId?: string
  ) {
    super(message);
    this.name = 'PollinationsError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

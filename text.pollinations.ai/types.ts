/**
 * Shared types for the text generation service.
 */

/** OpenAI-style chat message. */
export interface ChatMessage {
    role: string;
    content?: string | unknown[] | null;
    tool_call_id?: string;
    name?: string;
    tool_calls?: unknown[];
    function_call?: unknown;
    reasoning_content?: unknown;
    audio?: unknown;
    [key: string]: unknown;
}

/** Options bag threaded through transforms and generation functions. */
export interface TransformOptions {
    model?: string;
    modelDef?: unknown;
    modelConfig?: Record<string, unknown>;
    requestedModel?: string;
    stream?: boolean;
    temperature?: number;
    top_p?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    repetition_penalty?: number;
    seed?: number;
    max_tokens?: number;
    max_completion_tokens?: number;
    response_format?: { type: string; [key: string]: unknown };
    tools?: unknown[];
    tool_choice?: unknown;
    additionalHeaders?: Record<string, string>;
    userApiKey?: string;
    jsonMode?: boolean;
    voice?: string;
    reasoning_effort?: string;
    thinking_budget?: number;
    modalities?: string[];
    audio?: Record<string, unknown>;
    stream_options?: Record<string, unknown>;
    isPrivate?: boolean;
    referrer?: string;
    [key: string]: unknown;
}

/** Result returned by transform functions. */
export interface TransformResult {
    messages: ChatMessage[];
    options: TransformOptions;
}

/** A transform function that takes messages and options, returns a TransformResult. */
export type TransformFn = (
    messages: ChatMessage[],
    options: TransformOptions,
) => TransformResult | Promise<TransformResult>;

/** OpenAI-style chat completion choice. */
export interface CompletionChoice {
    message?: Record<string, unknown>;
    delta?: Record<string, unknown>;
    finish_reason?: string | null;
    index?: number;
    [key: string]: unknown;
}

/** OpenAI-style chat completion response. */
export interface ChatCompletion {
    id?: string;
    object?: string;
    created?: number;
    model?: string;
    choices?: CompletionChoice[];
    usage?: Record<string, number>;
    citations?: string[];
    error?: string | { message?: string; status?: number; details?: unknown };
    stream?: boolean;
    responseStream?: AsyncIterable<unknown> | NodeJS.ReadableStream | null;
    requestData?: unknown;
    [key: string]: unknown;
}

/** Error with optional HTTP status, details, and model info. */
export interface ServiceError extends Error {
    status?: number;
    code?: number | string;
    details?: unknown;
    model?: string;
    provider?: string;
    originalProvider?: string;
    response?: { data?: unknown };
}

/** Request data extracted from incoming HTTP requests. */
export interface RequestData {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    top_p?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    repetition_penalty?: number;
    seed?: number;
    stream?: boolean;
    isPrivate?: boolean;
    referrer?: string;
    voice?: string;
    jsonMode?: boolean;
    tools?: unknown[];
    tool_choice?: unknown;
    modalities?: string[];
    audio?: Record<string, unknown>;
    reasoning_effort?: string;
    thinking_budget?: number;
    response_format?: { type: string; [key: string]: unknown };
    max_tokens?: number;
    max_completion_tokens?: number;
    stop?: unknown;
    stream_options?: Record<string, unknown>;
    logprobs?: unknown;
    top_logprobs?: unknown;
    logit_bias?: unknown;
    user?: unknown;
    [key: string]: unknown;
}

/** Configuration for the generic OpenAI client. */
export interface OpenAIClientConfig {
    endpoint: string | ((model: string, options: TransformOptions) => string);
    authHeaderName?: string;
    authHeaderValue: () => string;
    defaultOptions?: Record<string, unknown>;
    formatResponse?: ((...args: unknown[]) => unknown) | null;
    additionalHeaders?: Record<string, string>;
}

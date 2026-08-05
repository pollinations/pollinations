/**
 * Shared types for the text generation service.
 */

import type { UpstreamHeaders } from "@shared/error.ts";

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
    portkeyGatewayUrl?: string;
    jsonMode?: boolean;
    voice?: string;
    reasoning_effort?: string;
    web_search_options?: {
        search_context_size: "low" | "medium" | "high";
    };
    modalities?: string[];
    audio?: Record<string, unknown>;
    normalizeFinishReasonAtTokenLimit?: boolean;
    stream_options?: Record<string, unknown>;
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
    message?: ChatMessage;
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
    usage?: Record<string, unknown>;
    citations?: string[];
    error?: string | { message?: string; status?: number; details?: unknown };
    stream?: boolean;
    responseStream?: ReadableStream | null;
    requestData?: unknown;
    /** Worker fallback candidate that served the call. */
    fallbackTarget?: string;
    /** Internal URL of the gateway request that produced this completion. */
    upstreamRequestUrl?: URL;
    [key: string]: unknown;
}

/** Error with optional HTTP status, details, and model info. */
export interface ServiceError extends Error {
    status?: number;
    upstreamStatus?: number;
    requestUrl?: URL;
    code?: number | string;
    /**
     * Stable, machine-readable error code (mirrors `UpstreamError.errorCode`),
     * propagated into the response envelope by the text error funnel.
     */
    errorCode?: string;
    details?: unknown;
    model?: string;
    provider?: string;
    response?: { data?: unknown };
    upstreamHeaders?: UpstreamHeaders;
}

export type TextVariables = {
    upstreamRequestUrl?: URL;
};

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
    voice?: string;
    jsonMode?: boolean;
    tools?: unknown[];
    tool_choice?: unknown;
    modalities?: string[];
    audio?: Record<string, unknown>;
    reasoning_effort?: string;
    web_search_options?: {
        search_context_size: "low" | "medium" | "high";
    };
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
    defaultOptions?: Record<string, unknown>;
    additionalHeaders?: Record<string, string>;
}

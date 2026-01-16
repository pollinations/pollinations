/**
 * Type definitions for the text generation service
 */

// Tier types from shared registry
export type Tier = "spore" | "seed" | "flower" | "nectar";

export interface Message {
    role: "system" | "user" | "assistant" | "tool";
    content: string | MessageContent[];
    name?: string;
    tool_call_id?: string;
    tool_calls?: ToolCall[];
}

export interface MessageContent {
    type: "text" | "image_url";
    text?: string;
    image_url?: {
        url: string;
        detail?: "auto" | "low" | "high";
    };
}

export interface ToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}

export interface Tool {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}

export interface TextGenerationRequest {
    model: string;
    messages: Message[];
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    seed?: number;
    tools?: Tool[];
    tool_choice?:
        | "none"
        | "auto"
        | "required"
        | { type: "function"; function: { name: string } };
    response_format?: ResponseFormat;
    modalities?: string[];
    audio?: AudioConfig;
    [key: string]: unknown;
}

export interface ResponseFormat {
    type: "text" | "json_object" | "json_schema";
    json_schema?: {
        name: string;
        strict?: boolean;
        schema: Record<string, unknown>;
    };
}

export interface AudioConfig {
    voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
    format?: "wav" | "mp3" | "flac" | "opus" | "pcm16";
}

export interface TextGenerationResponse {
    id: string;
    object: "chat.completion";
    created: number;
    model: string;
    choices: Choice[];
    usage?: Usage;
    system_fingerprint?: string;
}

export interface Choice {
    index: number;
    message?: Message;
    delta?: Partial<Message>;
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
    logprobs?: unknown;
}

export interface Usage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface StreamChunk {
    id: string;
    object: "chat.completion.chunk";
    created: number;
    model: string;
    choices: Array<{
        index: number;
        delta: Partial<Message>;
        finish_reason: string | null;
    }>;
}

export interface ModelDefinition {
    name: string;
    description?: string;
    config: () => ProviderConfig | Promise<ProviderConfig>;
    transform?: TransformFunction;
    tier?: Tier;
    hidden?: boolean;
    input_modalities?: string[];
    output_modalities?: string[];
    tools?: boolean;
}

export interface ProviderConfig {
    provider: string;
    authKey?: string | (() => string | Promise<string>);
    model?: string;
    "custom-host"?: string;
    defaultOptions?: Record<string, unknown>;
    [key: string]: unknown;
}

export type TransformFunction = (
    messages: Message[],
    options: Record<string, unknown>,
) => { messages: Message[]; options: Record<string, unknown> };

export interface TextServiceEnv {
    // Portkey
    PORTKEY_API_KEY?: string;

    // Azure
    AZURE_OPENAI_API_KEY?: string;
    AZURE_OPENAI_ENDPOINT?: string;
    AZURE_MYCELI_GPT5MINI_API_KEY?: string;
    AZURE_MYCELI_DEEPSEEK_R1_API_KEY?: string;

    // AWS
    AWS_ACCESS_KEY_ID?: string;
    AWS_SECRET_ACCESS_KEY?: string;
    AWS_REGION?: string;
    AWS_BEARER_TOKEN_BEDROCK?: string;

    // Google
    GOOGLE_PROJECT_ID?: string;
    GOOGLE_CLIENT_EMAIL?: string;
    GOOGLE_PRIVATE_KEY?: string;

    // Other providers
    SCALEWAY_API_KEY?: string;
    SCALEWAY_BASE_URL?: string;
    PERPLEXITY_API_KEY?: string;
    OVHCLOUD_API_KEY?: string;
    FIREWORKS_API_KEY?: string;

    [key: string]: string | undefined;
}

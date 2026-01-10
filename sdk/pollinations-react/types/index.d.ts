declare module "@pollinations/react" {
    export interface RequestOptions {
        signal?: AbortSignal;
    }

    export type MessageRole = "system" | "developer" | "user" | "assistant" | "tool" | "function";

    export interface Message {
        role: MessageRole;
        content: string | MessageContentPart[];
        name?: string;
        tool_call_id?: string;
    }

    export interface Model {
        id?: string;
        name?: string;
        [key: string]: any;
    }

    export type TextModel = string;

    export interface TextGenerateOptions extends RequestOptions {
        model?: TextModel;
        systemPrompt?: string;
        seed?: number;
        json?: boolean;
        temperature?: number;
        maxTokens?: number;
        frequencyPenalty?: number;
        presencePenalty?: number;
        stream?: boolean;
        private?: boolean;
    }

    export interface TextOptions extends TextGenerateOptions {
        apiKey: string;
    }

    export type ImageModel = string;
    export type ImageQuality = "low" | "medium" | "high" | "hd";

    export interface ImageGenerateOptions extends RequestOptions {
        model?: ImageModel;
        width?: number;
        height?: number;
        seed?: number;
        enhance?: boolean;
        negativePrompt?: string;
        private?: boolean;
        nologo?: boolean;
        nofeed?: boolean;
        safe?: boolean;
        quality?: ImageQuality;
        referenceImage?: string | string[];
        transparent?: boolean;
        guidanceScale?: number;
    }

    export interface ImageOptions extends ImageGenerateOptions {
        apiKey: string;
    }

    export type VideoModel = string;

    export interface VideoGenerateOptions extends RequestOptions {
        model?: VideoModel;
        duration?: number;
        aspectRatio?: string;
        seed?: number;
        audio?: boolean;
        referenceImage?: string | string[];
        private?: boolean;
        nologo?: boolean;
        safe?: boolean;
    }

    export interface VideoOptions extends VideoGenerateOptions {
        apiKey: string;
    }

    export type ResponseFormat =
        | { type: "text" }
        | { type: "json_object" }
        | { type: "json_schema"; json_schema: JsonSchema };

    export interface JsonSchema {
        name: string;
        description?: string;
        schema: Record<string, unknown>;
        strict?: boolean;
    }

    export interface Tool {
        type: "function";
        function: {
            name: string;
            description?: string;
            parameters?: Record<string, unknown>;
            strict?: boolean;
        };
    }

    export type BuiltInToolType =
        | "code_execution"
        | "google_search"
        | "google_maps"
        | "url_context"
        | "computer_use"
        | "file_search";

    export interface ThinkingOptions {
        type: "enabled" | "disabled";
        budget_tokens?: number;
    }

    export type AudioVoice = string;
    export type AudioFormat = "wav" | "mp3" | "flac" | "opus" | "pcm16";

    export interface ChatCompletionOptions extends RequestOptions {
        model?: TextModel;
        temperature?: number;
        topP?: number;
        maxTokens?: number;
        frequencyPenalty?: number;
        presencePenalty?: number;
        repetitionPenalty?: number;
        stop?: string | string[];
        seed?: number;
        stream?: boolean;
        streamOptions?: { include_usage?: boolean };
        responseFormat?: ResponseFormat;
        tools?: (Tool | { type: BuiltInToolType })[];
        toolChoice?:
            | "none"
            | "auto"
            | "required"
            | { type: "function"; function: { name: string } };
        parallelToolCalls?: boolean;
        thinking?: ThinkingOptions | null;
        reasoningEffort?: "low" | "medium" | "high";
        thinkingBudget?: number;
        modalities?: ("text" | "audio")[];
        audio?: {
            voice?: AudioVoice;
            format?: AudioFormat;
        };
        user?: string;
        logitBias?: Record<string, number>;
        logprobs?: boolean;
        topLogprobs?: number;
    }

    export interface ChatOptions extends ChatCompletionOptions {
        apiKey: string;
    }

    export interface ToolCall {
        id: string;
        type: "function";
        function: {
            name: string;
            arguments: string;
        };
    }

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

    export interface ChatChoice {
        index: number;
        message: {
            role: "assistant";
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
        finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
        logprobs?: {
            content?: Array<{
                token: string;
                logprob: number;
                bytes?: number[];
                top_logprobs?: Array<{
                    token: string;
                    logprob: number;
                    bytes?: number[];
                }>;
            }>;
        } | null;
    }

    export interface ChatResponse {
        id: string;
        object: "chat.completion";
        created: number;
        model: string;
        choices: ChatChoice[];
        usage?: CompletionUsage;
        system_fingerprint?: string;
        citations?: string[];
    }

    export interface ChatStreamChunk {
        id: string;
        object: "chat.completion.chunk";
        created: number;
        model: string;
        choices: Array<{
            index: number;
            delta: {
                role?: string;
                content?: string;
                tool_calls?: ToolCall[];
            };
            finish_reason: string | null;
        }>;
    }

    export interface TextContentPart {
        type: "text";
        text: string;
    }

    export interface ImageContentPart {
        type: "image_url";
        image_url: {
            url: string;
            detail?: "auto" | "low" | "high";
            mime_type?: string;
        };
    }

    export interface VideoContentPart {
        type: "video_url";
        video_url: {
            url: string;
            mime_type?: string;
        };
    }

    export interface AudioContentPart {
        type: "input_audio";
        input_audio: {
            data: string;
            format: "wav" | "mp3" | "flac" | "opus" | "pcm16";
        };
    }

    export interface FileContentPart {
        type: "file";
        file: {
            file_data?: string;
            file_id?: string;
            file_name?: string;
            file_url?: string;
            mime_type?: string;
        };
    }

    export type MessageContentPart =
        | TextContentPart
        | ImageContentPart
        | VideoContentPart
        | AudioContentPart
        | FileContentPart;

    export type MessageContent = string | MessageContentPart[];

    export interface ModelsOptions {
        apiKey?: string;
    }

    export interface ModelInfo {
        id: string;
        name: string;
        [key: string]: any;
    }

    export interface UseTextReturn {
        data: string | object | null;
        isLoading: boolean;
        error: string | null;
    }

    export interface UseImageReturn {
        data: string | null;
        isLoading: boolean;
        error: string | null;
    }

    export interface UseVideoReturn {
        data: string | null;
        isLoading: boolean;
        error: string | null;
    }

    export interface UseChatReturn {
        sendMessage: (message: string) => void;
        sendUserMessage: (message: string) => void;
        messages: Message[];
        isLoading: boolean;
        error: string | null;
        reset: () => void;
    }

    export interface UseModelsReturn {
        models: ModelInfo[];
        isLoading: boolean;
        error: string | null;
    }

    export function usePollinationsText(
        prompt: string | null,
        options?: TextOptions,
    ): UseTextReturn;

    export function usePollinationsImage(
        prompt: string,
        options?: ImageOptions,
    ): UseImageReturn;

    export function usePollinationsVideo(
        prompt: string,
        options?: VideoOptions,
    ): UseVideoReturn;

    export function usePollinationsChat(
        initialMessages?: Message[],
        options?: ChatOptions,
    ): UseChatReturn;

    export function usePollinationsModels(
        type?: "text" | "image" | "video",
        options?: ModelsOptions,
    ): UseModelsReturn;
}

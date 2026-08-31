export type ChatRole = "assistant" | "developer" | "system" | "user";

export interface ChatMessage {
    role: ChatRole;
    content: string;
    name?: string;
}

export interface CallerMetadata {
    id: string;
}

export interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    conversation_id?: string;
    max_tokens?: number;
    max_completion_tokens?: number;
    stream?: boolean;
    _pollinations?: {
        caller?: CallerMetadata;
    };
}

export interface ChatCompletionResponse {
    id: string;
    object: "chat.completion";
    created: number;
    model: "humans";
    conversation_id: string;
    choices: Array<{
        index: 0;
        message: { role: "assistant"; content: string };
        finish_reason: "stop" | "length";
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    _pollinations: {
        responder: { discordId: string };
    };
}

export interface ConversationRecord {
    callerUserId: string;
    conversationId: string;
    threadId: string;
}

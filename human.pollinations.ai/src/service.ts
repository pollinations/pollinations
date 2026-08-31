import { randomUUID, timingSafeEqual } from "node:crypto";
import type { HumanGateway, HumanReply } from "./discord.js";
import type { ConversationStore } from "./store.js";
import {
    completionLimit,
    countPromptTokens,
    truncateToTokens,
} from "./tokens.js";
import type {
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
    ConversationRecord,
} from "./types.js";

export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly code = "invalid_request_error",
    ) {
        super(message);
    }
}

interface HumanServiceOptions {
    apiToken: string;
    responseTimeoutMs: number;
    store: ConversationStore;
    gateway: HumanGateway;
}

export class HumanService {
    readonly #options: HumanServiceOptions;

    constructor(options: HumanServiceOptions) {
        this.#options = options;
    }

    authorize(header: string | undefined): void {
        const prefix = "Bearer ";
        if (!header?.startsWith(prefix))
            throw new HttpError(401, "Unauthorized", "unauthorized");
        const supplied = Buffer.from(header.slice(prefix.length));
        const expected = Buffer.from(this.#options.apiToken);
        if (
            supplied.length !== expected.length ||
            !timingSafeEqual(supplied, expected)
        ) {
            throw new HttpError(401, "Unauthorized", "unauthorized");
        }
    }

    async complete(input: unknown): Promise<ChatCompletionResponse> {
        const request = parseRequest(input);
        const callerId = request._pollinations?.caller?.id;
        if (!callerId) {
            throw new HttpError(400, "Trusted caller metadata is required");
        }

        if (!request.conversation_id) {
            const threadId = await this.#options.gateway.createThread(
                `human-${randomUUID().slice(0, 12)}`,
            );
            const conversation = this.#options.store.create(callerId, threadId);
            return this.#completeConversation(request, conversation, false);
        }

        const conversation = this.#existingConversation(
            callerId,
            request.conversation_id,
        );
        return this.#completeConversation(request, conversation, true);
    }

    async #completeConversation(
        request: ChatCompletionRequest,
        conversation: ConversationRecord,
        isContinuation: boolean,
    ): Promise<ChatCompletionResponse> {
        const messages = isContinuation
            ? [request.messages.at(-1) as ChatMessage]
            : request.messages;
        let reply: HumanReply;
        try {
            reply = await this.#options.gateway.ask(
                conversation.threadId,
                messages,
                this.#options.responseTimeoutMs,
            );
        } catch (error) {
            if (
                error instanceof Error &&
                error.message === "No eligible human response before timeout"
            ) {
                throw new HttpError(504, error.message, "response_timeout");
            }
            throw error;
        }
        const completion = truncateToTokens(
            reply.content,
            completionLimit(request),
        );
        const promptTokens = countPromptTokens(request.messages);

        return {
            id: `chatcmpl-human-${randomUUID()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "humans",
            conversation_id: conversation.conversationId,
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: completion.text },
                    finish_reason: completion.truncated ? "length" : "stop",
                },
            ],
            usage: {
                prompt_tokens: promptTokens,
                completion_tokens: completion.tokens,
                total_tokens: promptTokens + completion.tokens,
            },
            _pollinations: { responder: { discordId: reply.discordId } },
        };
    }

    #existingConversation(
        callerId: string,
        conversationId: string,
    ): ConversationRecord {
        const conversation = this.#options.store.get(callerId, conversationId);
        if (!conversation)
            throw new HttpError(404, "Conversation not found", "not_found");
        return conversation;
    }
}

function parseRequest(input: unknown): ChatCompletionRequest {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new HttpError(400, "Request body must be an object");
    }
    const request = input as Partial<ChatCompletionRequest>;
    if (request.stream) throw new HttpError(400, "Streaming is not supported");
    if (!Array.isArray(request.messages) || request.messages.length === 0) {
        throw new HttpError(400, "messages must be a non-empty array");
    }
    const roles = new Set(["assistant", "developer", "system", "user"]);
    for (const message of request.messages) {
        if (
            !message ||
            typeof message !== "object" ||
            !roles.has(message.role) ||
            typeof message.content !== "string"
        ) {
            throw new HttpError(400, "Only text chat messages are supported");
        }
    }
    for (const [name, value] of [
        ["max_tokens", request.max_tokens],
        ["max_completion_tokens", request.max_completion_tokens],
    ] as const) {
        if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
            throw new HttpError(400, `${name} must be a positive integer`);
        }
    }
    if (
        request.conversation_id !== undefined &&
        typeof request.conversation_id !== "string"
    ) {
        throw new HttpError(400, "conversation_id must be a string");
    }
    return request as ChatCompletionRequest;
}

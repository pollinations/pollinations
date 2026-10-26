import { UpstreamError } from "@shared/error.ts";
import { openaiUsageToUsage } from "@shared/registry/usage-headers.ts";
import {
    type CompletionUsage,
    CompletionUsageSchema,
} from "@shared/schemas/openai.ts";
import { createParser } from "eventsource-parser";
import type { ChatCompletion } from "../types.js";
import { validatedSSEStream } from "../validatedSSEStream.js";

const MAX_COMMUNITY_COMPLETION_TOKENS = 2_000_000;

function plausibleCommunityUsage(
    usage: CompletionUsage,
    requestBytes: number,
): boolean {
    // The request itself is evidence for prompt/cache tokens, including long
    // contexts. The fixed floor avoids rejecting compact prompts with large
    // hidden provider overhead; the completion ceiling prevents huge claims.
    const promptLimit = Math.max(2_000_000, requestBytes * 4);
    const normalized = openaiUsageToUsage(usage);
    const promptTokens =
        (normalized.promptTextTokens ?? 0) +
        (normalized.promptCachedTokens ?? 0) +
        (normalized.promptCacheWriteTokens ?? 0) +
        (normalized.promptAudioTokens ?? 0) +
        (normalized.promptImageTokens ?? 0) +
        (normalized.promptVideoTokens ?? 0);
    const completionTokens =
        (normalized.completionTextTokens ?? 0) +
        (normalized.completionReasoningTokens ?? 0) +
        (normalized.completionAudioTokens ?? 0);
    return (
        promptTokens <= promptLimit &&
        completionTokens <= MAX_COMMUNITY_COMPLETION_TOKENS &&
        usage.total_tokens <= promptLimit + MAX_COMMUNITY_COMPLETION_TOKENS
    );
}

export function requireChatCompletionUsage(
    completion: ChatCompletion,
    communityRequestBytes?: number,
): void {
    const parsed = CompletionUsageSchema.safeParse(completion.usage);
    if (
        parsed.success &&
        (communityRequestBytes === undefined ||
            plausibleCommunityUsage(parsed.data, communityRequestBytes))
    )
        return;

    throw new UpstreamError(502, {
        message:
            communityRequestBytes === undefined
                ? "Chat Completions provider returned an invalid response or omitted usage"
                : "Community Chat provider returned invalid or implausible usage",
        requestUrl: completion.upstreamRequestUrl,
    });
}

export class ChatUsageError extends Error {
    override readonly name = "ChatUsageError";

    constructor(
        message: string,
        readonly code = "usage_missing",
    ) {
        super(message);
    }
}

// Tracking reads this off the emitted error event: the validator drops the
// provider's [DONE] when usage is missing there, so the message is the only
// record that the sentinel arrived.
export const CHAT_USAGE_MISSING_AT_DONE_MESSAGE =
    "Chat Completions provider returned invalid or omitted terminal usage";

export function createChatStreamUsageValidator(communityRequestBytes?: number) {
    const decoder = new TextDecoder();
    let lastUsage: unknown;
    let doneSeen = false;
    let errorSeen = false;

    const parser = createParser({
        onEvent(message) {
            if (doneSeen) return;
            if (message.data.trim() === "[DONE]") {
                const parsed = CompletionUsageSchema.safeParse(lastUsage);
                if (!errorSeen && !parsed.success) {
                    throw new ChatUsageError(
                        CHAT_USAGE_MISSING_AT_DONE_MESSAGE,
                    );
                }
                if (
                    !errorSeen &&
                    communityRequestBytes !== undefined &&
                    parsed.success &&
                    !plausibleCommunityUsage(parsed.data, communityRequestBytes)
                ) {
                    throw new ChatUsageError(
                        "Community Chat provider returned implausible usage",
                        "usage_invalid",
                    );
                }
                doneSeen = true;
                return;
            }

            let event: unknown;
            try {
                event = JSON.parse(message.data);
            } catch {
                return;
            }
            if (!event || typeof event !== "object") return;
            const { usage, error } = event as {
                usage?: unknown;
                error?: unknown;
            };
            if (error && typeof error === "object") errorSeen = true;
            // Some providers append cost/cache metadata after their token totals.
            // It is not a new token count; billing also uses the last complete usage.
            if (
                usage &&
                typeof usage === "object" &&
                !Array.isArray(usage) &&
                !["prompt_tokens", "completion_tokens", "total_tokens"].some(
                    (key) => key in usage,
                )
            ) {
                return;
            }
            // Providers may send provisional counts; only the last update is final.
            if (usage !== null && usage !== undefined) lastUsage = usage;
        },
    });

    return {
        feed(chunk: Uint8Array) {
            parser.feed(decoder.decode(chunk, { stream: true }));
        },
        finish() {
            // Some compatible providers close after one newline instead of an
            // empty SSE separator. Flush that final event for validation only;
            // the client still receives the exact upstream bytes.
            parser.feed(`${decoder.decode()}\n\n`);
            parser.reset({ consume: true });
            if (!errorSeen && !doneSeen) {
                throw new ChatUsageError(
                    "Chat Completions provider ended without terminal usage",
                );
            }
        },
    };
}

function chatUsageErrorEvent(error: ChatUsageError): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(
        `data: ${JSON.stringify({
            error: {
                message: error.message,
                type: "upstream_error",
                code: error.code,
            },
        })}\n\n`,
    );
}

export function requireChatStreamUsage(
    body: ReadableStream<Uint8Array<ArrayBuffer>>,
    communityRequestBytes?: number,
): ReadableStream<Uint8Array<ArrayBuffer>> {
    return validatedSSEStream(
        body,
        createChatStreamUsageValidator(communityRequestBytes),
        (error) => {
            if (!(error instanceof ChatUsageError)) throw error;
            return chatUsageErrorEvent(error);
        },
    );
}

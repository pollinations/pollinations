import { UpstreamError } from "@shared/error.ts";
import type { ContentFilterResult } from "@shared/schemas/openai.ts";
import { createParser } from "eventsource-parser";
import { mergeContentFilterResults } from "../../content-filter.ts";
import { withUpstreamRequestUrl } from "../genericOpenAIClient.js";
import type { ChatCompletion, CompletionChoice } from "../types.js";

type JsonObject = Record<string, unknown>;

// Delta text fields arrive in pieces; every other string is sent whole.
const CONCATENATED = new Set([
    "content",
    "reasoning",
    "reasoning_content",
    "refusal",
    "arguments",
    "text",
    "summary",
]);
const TOKEN_KEYS = ["prompt_tokens", "completion_tokens", "total_tokens"];

function isObject(value: unknown): value is JsonObject {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Fold one stream delta into the message built so far. */
function mergeDelta(target: JsonObject, delta: JsonObject): void {
    for (const [key, value] of Object.entries(delta)) {
        if (value === null || value === undefined) continue;
        const current = target[key];
        if (typeof value === "string") {
            if (CONCATENATED.has(key)) target[key] = `${current ?? ""}${value}`;
            else if (!current) target[key] = value;
        } else if (Array.isArray(value)) {
            // Indexed items (tool calls, reasoning details) are deltas of one
            // item; unindexed items (logprob tokens) are new ones.
            const items = Array.isArray(current) ? current : [];
            for (const item of value) {
                const existing = isObject(item)
                    ? items.find(
                          (entry) =>
                              isObject(entry) &&
                              typeof item.index === "number" &&
                              entry.index === item.index,
                      )
                    : undefined;
                if (existing) mergeDelta(existing as JsonObject, item);
                else items.push(isObject(item) ? mergeNew(item) : item);
            }
            target[key] = items;
        } else if (isObject(value)) {
            const nested = isObject(current) ? current : {};
            mergeDelta(nested, value);
            target[key] = nested;
        } else {
            target[key] = value;
        }
    }
}

function mergeNew(item: JsonObject): JsonObject {
    const copy = {};
    mergeDelta(copy, item);
    return copy;
}

type ChoiceState = {
    message: JsonObject;
    thinking: string;
    signature: string;
    finishReason: unknown;
    filters: ContentFilterResult[];
    rest: JsonObject;
};

function finishChoice(index: number, state: ChoiceState): CompletionChoice {
    const { content_blocks: _blocks, tool_calls, ...message } = state.message;
    const calls = Array.isArray(tool_calls)
        ? tool_calls.map((call) => {
              const { index: _index, ...rest } = call as JsonObject;
              return { type: "function", ...rest };
          })
        : [];
    return {
        ...state.rest,
        index,
        message: {
            ...message,
            role: "assistant",
            content:
                (message.content as string | undefined) ??
                (calls.length ? null : ""),
            ...(calls.length ? { tool_calls: calls } : {}),
            // Signed thinking, in the shape non-stream Chat returns it.
            ...(state.thinking || state.signature
                ? {
                      content_blocks: [
                          {
                              type: "thinking",
                              thinking: state.thinking,
                              signature: state.signature,
                          },
                      ],
                  }
                : {}),
        },
        finish_reason: calls.length
            ? "tool_calls"
            : ((state.finishReason as string | undefined) ?? "stop"),
        ...(state.filters.length
            ? {
                  content_filter_results: mergeContentFilterResults(
                      state.filters,
                  ),
              }
            : {}),
    };
}

/**
 * Read a Chat Completions stream to its end and return the JSON completion a
 * non-stream request would have received. Asking the provider for a stream
 * keeps bytes flowing past Cloudflare's 125s first-byte limit (#15396).
 */
export async function chatStreamToCompletion(
    streamed: ChatCompletion,
): Promise<ChatCompletion> {
    const requestUrl = streamed.upstreamRequestUrl;
    const source = streamed.responseStream as ReadableStream<Uint8Array> | null;
    if (!source) {
        throw new UpstreamError(502, {
            message: "Text model returned an empty stream",
            requestUrl,
        });
    }

    const top: JsonObject = {};
    const choices = new Map<number, ChoiceState>();
    let usage: unknown;
    let failure: JsonObject | undefined;

    const onChunk = (chunk: JsonObject) => {
        const { choices: chunkChoices, usage: chunkUsage, ...rest } = chunk;
        if (isObject(rest.error)) failure ??= rest.error;
        for (const [key, value] of Object.entries(rest)) {
            if (value !== null && value !== undefined) top[key] = value;
        }
        // Same rule as stream billing: the last update carrying token counts.
        if (isObject(chunkUsage) && TOKEN_KEYS.some((key) => key in chunkUsage))
            usage = chunkUsage;
        if (!Array.isArray(chunkChoices)) return;
        for (const [position, raw] of chunkChoices.entries()) {
            if (!isObject(raw)) continue;
            const {
                index,
                delta,
                finish_reason,
                content_filter_results,
                ...extra
            } = raw;
            const key = typeof index === "number" ? index : position;
            let state = choices.get(key);
            if (!state) {
                state = {
                    message: {},
                    thinking: "",
                    signature: "",
                    finishReason: undefined,
                    filters: [],
                    rest: {},
                };
                choices.set(key, state);
            }
            if (isObject(delta)) {
                mergeDelta(state.message, delta);
                for (const block of Array.isArray(delta.content_blocks)
                    ? delta.content_blocks
                    : []) {
                    const blockDelta = isObject(block) ? block.delta : null;
                    if (!isObject(blockDelta)) continue;
                    if (typeof blockDelta.thinking === "string")
                        state.thinking += blockDelta.thinking;
                    if (typeof blockDelta.signature === "string")
                        state.signature += blockDelta.signature;
                }
            }
            if (finish_reason) state.finishReason = finish_reason;
            if (isObject(content_filter_results))
                state.filters.push(
                    content_filter_results as ContentFilterResult,
                );
            mergeDelta(state.rest, extra);
        }
    };

    const parser = createParser({
        onEvent(event) {
            if (event.data.trim() === "[DONE]") return;
            let chunk: unknown;
            try {
                chunk = JSON.parse(event.data);
            } catch {
                return;
            }
            if (isObject(chunk)) onChunk(chunk);
        },
    });
    const decoder = new TextDecoder();
    const reader = source.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
    }
    parser.feed(`${decoder.decode()}\n\n`);

    if (failure) {
        const code = failure.code;
        throw new UpstreamError(
            typeof code === "number" && code >= 400 && code <= 599
                ? (code as 502)
                : 502,
            {
                message:
                    typeof failure.message === "string"
                        ? failure.message
                        : "Provider stream failed",
                requestUrl,
            },
        );
    }

    const { error: _error, stream: _stream, ...metadata } = top;
    const completion: ChatCompletion = {
        ...metadata,
        id: (metadata.id as string | undefined) ?? streamed.id,
        object: "chat.completion",
        created: (metadata.created as number | undefined) ?? streamed.created,
        model: (metadata.model as string | undefined) ?? streamed.model,
        choices: [...choices.entries()]
            .sort(([a], [b]) => a - b)
            .map(([index, state]) => finishChoice(index, state)),
        usage: usage as ChatCompletion["usage"],
    };
    return requestUrl
        ? withUpstreamRequestUrl(completion, requestUrl)
        : completion;
}

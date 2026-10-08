import { UpstreamError } from "@shared/error.ts";
import { createParser } from "eventsource-parser";
import { requireChatCompletionUsage } from "./chat/usage.ts";
import { genericOpenAIClient } from "./genericOpenAIClient.ts";
import type {
    ChatCompletion,
    ChatMessage,
    OpenAIClientConfig,
    TransformOptions,
} from "./types.ts";

function requireUsage(completion: ChatCompletion) {
    requireChatCompletionUsage(completion);
    const cost = completion.usage?.cost;
    if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0)
        throw new UpstreamError(502, {
            message: "Vercel search omitted its provider charge",
        });
    return completion.usage as Record<string, unknown>;
}

// Both generations are one public request. Sum provider counters and dollars,
// including cached/reasoning tokens, without charging search a second time.
function sumUsage(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
): Record<string, unknown> {
    const result = { ...a, ...b };
    for (const [key, value] of Object.entries(a)) {
        if (typeof value === "number" && typeof b[key] === "number")
            result[key] = value + b[key];
        else if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            b[key] &&
            typeof b[key] === "object" &&
            !Array.isArray(b[key])
        )
            result[key] = sumUsage(
                value as Record<string, unknown>,
                b[key] as Record<string, unknown>,
            );
    }
    return result;
}

/** Gemini 2.5 cannot combine tools with controlled JSON generation. */
export async function callVercelSearch(
    messages: ChatMessage[],
    options: TransformOptions,
    config: OpenAIClientConfig,
): Promise<ChatCompletion> {
    if (
        !options.response_format ||
        options.response_format.type === "text" ||
        !options.tools?.length ||
        options.tool_choice === "none"
    )
        return genericOpenAIClient(messages, options, config);

    const search = await genericOpenAIClient(
        [
            ...messages,
            {
                role: "user",
                content: `Search and collect the facts needed for the preceding request and this JSON format: ${JSON.stringify(options.response_format)}. Include the full source URLs in your answer.`,
            },
        ],
        {
            ...options,
            response_format: undefined,
            stream: false,
            stream_options: undefined,
        },
        config,
    );
    const searchUsage = requireUsage(search);
    const searchContent = search.choices?.[0]?.message?.content;
    if (typeof searchContent !== "string" || !searchContent.trim())
        throw new UpstreamError(502, {
            message: "Vercel search returned no answer to format",
            requestUrl: search.upstreamRequestUrl,
        });
    const result = await genericOpenAIClient(
        [
            ...messages,
            {
                role: "user",
                content: `Format this search answer as JSON for the requested format. Preserve its facts and source URLs; do not invent facts or sources.\n${searchContent}`,
            },
        ],
        { ...options, tools: undefined, tool_choice: undefined },
        config,
    );
    const metadata = search.choices?.[0]?.message?.provider_metadata;
    if (!result.stream) {
        result.usage = sumUsage(searchUsage, requireUsage(result));
        if (result.choices?.[0]?.message)
            result.choices[0].message.provider_metadata = metadata;
        return result;
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let lastUsage: Record<string, unknown> | undefined;
    let sentMetadata = false;
    let emit: (event: string) => void;
    const parser = createParser({
        onEvent(event) {
            if (event.data.trim() === "[DONE]") {
                requireUsage({ usage: lastUsage });
                emit("[DONE]");
                return;
            }
            const chunk = JSON.parse(event.data) as ChatCompletion;
            if (!sentMetadata && chunk.choices?.[0]?.delta) {
                chunk.choices[0].delta.provider_metadata = metadata;
                sentMetadata = true;
            }
            if (chunk.usage) {
                if ("prompt_tokens" in chunk.usage) {
                    requireChatCompletionUsage(chunk);
                    lastUsage = chunk.usage;
                } else if (lastUsage)
                    lastUsage = { ...lastUsage, ...chunk.usage };
                // Never synthesize terminal usage from the first call alone.
                if (lastUsage) {
                    chunk.usage = sumUsage(searchUsage, lastUsage);
                }
            }
            emit(JSON.stringify(chunk));
        },
    });
    result.responseStream = result.responseStream?.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                emit = (data) =>
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                parser.feed(decoder.decode(chunk, { stream: true }));
            },
            flush(controller) {
                emit = (data) =>
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                parser.feed(`${decoder.decode()}\n\n`);
                parser.reset({ consume: true });
                requireUsage({ usage: lastUsage });
            },
        }),
    );
    return result;
}

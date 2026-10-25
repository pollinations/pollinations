import { createParser } from "eventsource-parser";
import type { ChatCompletion } from "../types.ts";

function publicMessage<T extends Record<string, unknown>>(
    message: T | undefined,
): T | undefined {
    if (!message) return message;
    const metadata = message.provider_metadata as
        | Record<string, unknown>
        | undefined;
    if (!metadata || typeof metadata !== "object" || !("gateway" in metadata))
        return message;
    const { gateway: _gateway, ...rest } = metadata;
    return {
        ...message,
        provider_metadata: Object.keys(rest).length ? rest : undefined,
    };
}

// InferencePort's `payg_*` fields hold its ledger entry, including our account
// balance.
export function withoutPayg<T extends object>(value: T): T {
    return Object.fromEntries(
        Object.entries(value).filter(([key]) => !key.startsWith("payg_")),
    ) as T;
}

// Provider billing fields stay internal: OpenRouter's `cost` and `cost_details`
// are what it charged us.
function isPrivateUsageKey(key: string): boolean {
    return (
        key === "cost" ||
        key === "cost_details" ||
        key === "search_context_size" ||
        key.startsWith("payg_")
    );
}

export function publicUsage(
    usage: ChatCompletion["usage"],
): ChatCompletion["usage"] {
    if (!usage || !Object.keys(usage).some(isPrivateUsageKey)) return usage;
    return Object.fromEntries(
        Object.entries(usage).filter(([key]) => !isPrivateUsageKey(key)),
    );
}

// Gateway tool counters stay on the tracking branch, not the client response.
export function publicChatChoices(
    choices: ChatCompletion["choices"],
): ChatCompletion["choices"] {
    return choices?.map((choice) => ({
        ...choice,
        message: publicMessage(choice.message),
        delta: publicMessage(choice.delta),
    }));
}

export function publicChatStream(
    body: ReadableStream<Uint8Array<ArrayBuffer>>,
): ReadableStream<Uint8Array<ArrayBuffer>> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let parser: ReturnType<typeof createParser>;
    return body.pipeThrough(
        new TransformStream({
            start(controller) {
                parser = createParser({
                    onRetry(milliseconds) {
                        controller.enqueue(
                            encoder.encode(`retry: ${milliseconds}\n\n`),
                        );
                    },
                    onComment(comment) {
                        controller.enqueue(encoder.encode(`: ${comment}\n\n`));
                    },
                    onEvent(event) {
                        let data = event.data;
                        if (data.trim() !== "[DONE]") {
                            try {
                                const chunk = withoutPayg(
                                    JSON.parse(data) as ChatCompletion,
                                );
                                data = JSON.stringify({
                                    ...chunk,
                                    ...(chunk.usage && {
                                        usage: publicUsage(chunk.usage),
                                    }),
                                    choices: publicChatChoices(chunk.choices),
                                });
                            } catch {
                                // Leave non-JSON events unchanged; validation happens before the tee.
                            }
                        }
                        const lines = data
                            .split(/\r\n|\r|\n/)
                            .map((line) => `data: ${line}`)
                            .join("\n");
                        controller.enqueue(
                            encoder.encode(
                                `${event.id !== undefined ? `id: ${event.id}\n` : ""}${event.event ? `event: ${event.event}\n` : ""}${lines}\n\n`,
                            ),
                        );
                    },
                });
            },
            transform(chunk) {
                parser.feed(decoder.decode(chunk, { stream: true }));
            },
            flush() {
                parser.feed(`${decoder.decode()}\n\n`);
                parser.reset({ consume: true });
            },
        }),
    );
}

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
                    onComment(comment) {
                        controller.enqueue(encoder.encode(`: ${comment}\n\n`));
                    },
                    onEvent(event) {
                        let data = event.data;
                        if (data.trim() !== "[DONE]") {
                            try {
                                const chunk = JSON.parse(
                                    data,
                                ) as ChatCompletion;
                                data = JSON.stringify({
                                    ...chunk,
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

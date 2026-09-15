import {
    MODEL_USED_HEADER,
    openaiUsageToUsage,
    USAGE_MISSING_HEADER,
    USAGE_TYPE_HEADERS,
} from "@shared/registry/usage-headers.ts";
import {
    type CompletionUsage,
    CompletionUsageSchema,
} from "@shared/schemas/openai.ts";
import { createParser } from "eventsource-parser";

export const MAX_X402_RESPONSE_BYTES = 20 * 1024 * 1024;
const encoder = new TextEncoder();
export const X402_STREAM_DONE = "data: [DONE]\n\n";

export function x402StreamReceipt(receipt: string): Uint8Array<ArrayBuffer> {
    return encoder.encode(
        `event: x402.payment\ndata: ${JSON.stringify({ paymentResponse: receipt })}\n\n${X402_STREAM_DONE}`,
    );
}

/** Consume in the alarm, independently of readers, and retain one bounded replay. */
export class X402LiveStream {
    private readonly chunks: Uint8Array[] = [];
    private readonly readers = new Set<() => void>();
    private closed = false;

    constructor(private readonly headers: Headers) {}

    response(): Response {
        let cursor = 0;
        let cancelled = false;
        let wake: (() => void) | undefined;
        const body = new ReadableStream<Uint8Array>(
            {
                pull: async (controller) => {
                    while (
                        !cancelled &&
                        !this.closed &&
                        cursor === this.chunks.length
                    ) {
                        await new Promise<void>((resolve) => {
                            wake = resolve;
                            this.readers.add(resolve);
                        });
                    }
                    if (cancelled) return;
                    if (cursor < this.chunks.length)
                        controller.enqueue(this.chunks[cursor++]);
                    else controller.close();
                },
                cancel: () => {
                    cancelled = true;
                    if (wake) {
                        this.readers.delete(wake);
                        wake();
                    }
                },
            },
            { highWaterMark: 0 },
        );
        const headers = new Headers(this.headers);
        headers.set("cache-control", "private, no-store");
        headers.delete("content-length");
        return new Response(body, { headers });
    }

    write(chunk: Uint8Array): void {
        this.chunks.push(chunk);
        for (const wake of this.readers) wake();
        this.readers.clear();
    }

    finish(response: Response): void {
        const receipt = response.headers.get("payment-response");
        this.write(
            response.ok && receipt
                ? x402StreamReceipt(receipt)
                : encoder.encode(
                      `data: ${JSON.stringify({
                          error: {
                              type: "x402_error",
                              code: "payment_incomplete",
                              message:
                                  "Generation or payment did not complete. Retry with the same Idempotency-Key and payment signature.",
                          },
                      })}\n\n`,
                  ),
        );
        this.closed = true;
    }
}

/** Forward chat events now; retain metered bytes for Weft settlement and R2 replay.
 * [DONE] is withheld until settlement and receipt persistence have succeeded.
 */
export async function collectX402Stream(
    response: Response,
    onStream?: (headers: Headers) => (chunk: Uint8Array) => void,
): Promise<Response> {
    const model = response.headers.get(MODEL_USED_HEADER);
    if (
        !response.body ||
        !model ||
        !response.headers.get("content-type")?.includes("text/event-stream")
    ) {
        throw new Error("Expected a metered chat stream");
    }
    const publish = onStream?.(response.headers);
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let inputBytes = 0;
    let outputBytes = 0;
    let usage: CompletionUsage | undefined;
    let done = false;
    const parser = createParser({
        onEvent(event) {
            if (done) throw new Error("Chat stream continued after [DONE]");
            if (event.data.trim() === "[DONE]") {
                done = true;
                return;
            }
            const data = JSON.parse(event.data);
            if (
                !data ||
                typeof data !== "object" ||
                data.error ||
                event.event === "error"
            ) {
                throw new Error(
                    "Chat stream returned an error or invalid event",
                );
            }
            if (data.usage !== undefined && data.usage !== null) {
                usage = CompletionUsageSchema.parse(data.usage);
            }
            // Canonical SSE framing handles split UTF-8, CRLF and multi-line data.
            const chunk = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
            outputBytes += chunk.byteLength;
            if (outputBytes > MAX_X402_RESPONSE_BYTES)
                throw new Error("x402 stream exceeds the replay limit");
            chunks.push(chunk);
            publish?.(chunk);
        },
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const lineFragments: string[] = [];
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            inputBytes += chunk.value.byteLength;
            if (inputBytes > MAX_X402_RESPONSE_BYTES)
                throw new Error("x402 stream exceeds the replay limit");
            const text = decoder.decode(chunk.value, { stream: true });
            const end = Math.max(
                text.lastIndexOf("\n"),
                text.lastIndexOf("\r"),
            );
            // Feed complete lines: the parser rescans its pending line on every
            // feed, making a large, fragmented unterminated event quadratic.
            if (end < 0) {
                lineFragments.push(text);
            } else {
                lineFragments.push(text.slice(0, end + 1));
                parser.feed(lineFragments.join(""));
                lineFragments.length = 0;
                if (end + 1 < text.length)
                    lineFragments.push(text.slice(end + 1));
            }
        }
        parser.feed(`${lineFragments.join("")}${decoder.decode()}\n\n`);
        if (!done || !usage)
            throw new Error("Chat stream omitted terminal usage or [DONE]");
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete(USAGE_MISSING_HEADER);
    const normalized = openaiUsageToUsage(usage);
    // Zero is valid usage, so include zero-valued headers as well.
    for (const [unit, name] of Object.entries(USAGE_TYPE_HEADERS)) {
        headers.set(
            name,
            String(normalized[unit as keyof typeof normalized] ?? 0),
        );
    }
    return new Response(new Blob([...chunks, X402_STREAM_DONE]), {
        status: response.status,
        headers,
    });
}

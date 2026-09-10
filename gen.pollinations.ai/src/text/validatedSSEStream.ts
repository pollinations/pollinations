type StreamValidator = {
    feed(chunk: Uint8Array): void;
    finish(): void;
};

/** Validate whole SSE events before forwarding them, never half a JSON value. */
export function validatedSSEStream(
    body: ReadableStream<Uint8Array<ArrayBuffer>>,
    validator: StreamValidator,
    errorEvent: (error: unknown) => Uint8Array<ArrayBuffer>,
): ReadableStream<Uint8Array<ArrayBuffer>> {
    const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
    const encoder = new TextEncoder();
    let pending = "";

    return body.pipeThrough(
        new TransformStream({
            transform(chunk, controller) {
                pending += decoder.decode(chunk, { stream: true });
                try {
                    // CRLF is one newline, not an empty line. Accept all SSE line
                    // endings, including separators split between network chunks.
                    while (true) {
                        const boundary = /(?:\r\n|\n|\r(?!\n|$)){2}/.exec(
                            pending,
                        );
                        if (!boundary) break;
                        const end = boundary.index + boundary[0].length;
                        const event = pending.slice(0, end);
                        pending = pending.slice(end);
                        // The parser holds a trailing CR until the next byte.
                        // Complete it for validation only; preserve wire bytes.
                        validator.feed(
                            encoder.encode(
                                event.endsWith("\r") ? `${event}\n` : event,
                            ),
                        );
                        controller.enqueue(encoder.encode(event));
                    }
                } catch (error) {
                    controller.enqueue(errorEvent(error));
                    controller.terminate();
                }
            },
            flush(controller) {
                try {
                    const tail = encoder.encode(pending + decoder.decode());
                    validator.feed(tail);
                    validator.finish();
                    if (tail.length) controller.enqueue(tail);
                } catch (error) {
                    controller.enqueue(errorEvent(error));
                }
            },
        }),
    );
}

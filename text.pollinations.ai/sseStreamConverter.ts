/**
 * Creates a TransformStream that converts SSE JSON events using a mapper function.
 * Web Streams API replacement for the Node.js Transform-based version.
 */
export function createSseStreamConverter(
    mapper: (json: unknown) => unknown,
): TransformStream<Uint8Array, Uint8Array> {
    let buffer = "";
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    return new TransformStream({
        transform(chunk, controller) {
            buffer += decoder.decode(chunk, { stream: true });

            // Split on double-newline boundaries only — never consume
            // a partial event that hasn't been terminated yet.
            for (
                let boundary = buffer.indexOf("\n\n");
                boundary !== -1;
                boundary = buffer.indexOf("\n\n")
            ) {
                const segment = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);

                const dataMatch = segment.match(/(?:^|\n)data:(.*)/s);
                if (!dataMatch) continue;
                const dataLine = dataMatch[1].trim();

                if (!dataLine) continue;
                if (dataLine === "[DONE]") {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    continue;
                }

                try {
                    const parsed = JSON.parse(dataLine);
                    const mapped = mapper(parsed);
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(mapped)}\n\n`),
                    );
                } catch {}
            }
        },
        flush(controller) {
            // Process any remaining buffered data
            buffer += decoder.decode();
            if (buffer.trim()) {
                const dataLine = buffer.replace(/^data:/, "").trim();
                if (dataLine === "[DONE]") {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                } else if (dataLine) {
                    try {
                        const parsed = JSON.parse(dataLine);
                        const mapped = mapper(parsed);
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify(mapped)}\n\n`,
                            ),
                        );
                    } catch {
                        // Ignore unparseable trailing data
                    }
                }
            }
        },
    });
}

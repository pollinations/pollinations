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
            const eventRegex = /(^|\n)data:(.*?)(?=\n\n|$)/gs;
            let match: RegExpExecArray | null;
            let lastIndex = 0;

            while (true) {
                match = eventRegex.exec(buffer);
                if (match === null) break;
                const dataLine = match[2].trim();
                lastIndex = eventRegex.lastIndex;

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

            buffer = buffer.slice(lastIndex);
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

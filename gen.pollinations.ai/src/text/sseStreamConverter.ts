/**
 * Creates a TransformStream that converts SSE JSON events using a mapper
 * function. Splits only on complete SSE event boundaries so chunk boundaries
 * cannot consume partial JSON.
 */
export function createSseStreamConverter(
    mapper: (json: unknown) => unknown,
): TransformStream<Uint8Array, Uint8Array> {
    let buffer = "";
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    return new TransformStream({
        transform(chunk, controller) {
            buffer += decoder.decode(chunk, { stream: true });

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
                } catch {
                    // Ignore malformed upstream events.
                }
            }
        },
        flush(controller) {
            buffer += decoder.decode();
            const trimmed = buffer.trim();
            if (!trimmed) return;

            const dataLine = trimmed.replace(/^data:/, "").trim();
            if (dataLine === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                return;
            }

            try {
                const parsed = JSON.parse(dataLine);
                const mapped = mapper(parsed);
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(mapped)}\n\n`),
                );
            } catch {
                // Ignore unparseable trailing data.
            }
        },
    });
}

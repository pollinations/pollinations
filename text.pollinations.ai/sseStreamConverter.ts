import { Transform } from "node:stream";

/**
 * Creates a Transform stream that converts SSE JSON events using a mapper function.
 */
export function createSseStreamConverter(
    mapper: (json: unknown) => unknown,
): Transform {
    let buffer = "";

    return new Transform({
        transform(chunk, _encoding, callback) {
            buffer += chunk.toString();
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
                    this.push("data: [DONE]\n\n");
                    continue;
                }

                try {
                    const parsed = JSON.parse(dataLine);
                    const mapped = mapper(parsed);
                    this.push(`data: ${JSON.stringify(mapped)}\n\n`);
                } catch {}
            }

            buffer = buffer.slice(lastIndex);
            callback();
        },
        flush(callback) {
            if (buffer.trim()) {
                const dataLine = buffer.replace(/^data:/, "").trim();
                if (dataLine === "[DONE]") {
                    this.push("data: [DONE]\n\n");
                } else if (dataLine) {
                    try {
                        const parsed = JSON.parse(dataLine);
                        const mapped = mapper(parsed);
                        this.push(`data: ${JSON.stringify(mapped)}\n\n`);
                    } catch {
                        // Ignore unparseable trailing data
                    }
                }
            }
            callback();
        },
    });
}

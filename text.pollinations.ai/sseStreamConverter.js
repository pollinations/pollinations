import { Transform } from "node:stream";

/**
 * Creates a Transform stream that converts SSE JSON events using a mapper function.
 * @param {function(object): object} mapper - Function to transform each parsed JSON event.
 * @returns {Transform} Transform stream that emits mapped SSE events.
 */
export function createSseStreamConverter(mapper) {
    let buffer = "";

    return new Transform({
        readableObjectMode: false,
        writableObjectMode: false,
        transform(chunk, _encoding, callback) {
            buffer += chunk.toString();
            const eventRegex = /(^|\n)data:(.*?)(?=\n\n|$)/gs;
            let match;
            let lastIndex = 0;
            while ((match = eventRegex.exec(buffer)) !== null) {
                const dataLine = match[2].trim();
                lastIndex = eventRegex.lastIndex;
                if (!dataLine) continue;
                if (dataLine === "[DONE]") {
                    // Forward the DONE event as-is
                    this.push("data: [DONE]\n\n");
                    continue;
                }
                let parsed;
                try {
                    parsed = JSON.parse(dataLine);
                } catch (_e) {
                    // If not valid JSON, skip this event
                    continue;
                }
                let mapped;
                try {
                    mapped = mapper(parsed);
                } catch (_e) {
                    // If mapper throws, skip this event
                    continue;
                }
                // Emit as SSE event
                this.push(`data: ${JSON.stringify(mapped)}\n\n`);
            }
            // Keep any trailing incomplete data for next chunk
            buffer = buffer.slice(lastIndex);
            callback();
        },
        flush(callback) {
            // Handle any remaining buffered data
            if (buffer.trim()) {
                const dataLine = buffer.replace(/^data:/, "").trim();
                if (dataLine === "[DONE]") {
                    this.push("data: [DONE]\n\n");
                } else if (dataLine) {
                    try {
                        const parsed = JSON.parse(dataLine);
                        const mapped = mapper(parsed);
                        this.push(`data: ${JSON.stringify(mapped)}\n\n`);
                    } catch (_e) {
                        // Ignore errors on flush
                    }
                }
            }
            callback();
        },
    });
}

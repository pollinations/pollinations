export function parseChatStream(body) {
    let content = "";
    let usage;
    let done = false;
    let dataLines = [];

    const fail = (protocolError) => ({ content, usage, protocolError });
    const flushEvent = () => {
        if (!dataLines.length) return;
        const data = dataLines.join("\n");
        dataLines = [];
        if (data === "[DONE]") {
            done = true;
            return;
        }
        let chunk;
        try {
            chunk = JSON.parse(data);
        } catch {
            throw new Error("stream contained invalid JSON");
        }
        if (chunk?.error || !Array.isArray(chunk?.choices)) {
            throw new Error(
                chunk?.error?.code === "usage_missing"
                    ? "stream returned usage_missing: missing or invalid token usage"
                    : chunk?.error
                      ? "stream returned an error event"
                      : "stream event is missing a choices array",
            );
        }
        for (const choice of chunk.choices) {
            if (typeof choice?.delta?.content === "string") {
                content += choice.delta.content;
            }
        }
        if (chunk.usage) usage = chunk.usage;
    };

    try {
        for (const line of body.split(/\r\n|\n|\r/)) {
            if (!line) {
                flushEvent();
                continue;
            }
            if (done) return fail("stream contained data after [DONE]");
            if (dataLines.includes("[DONE]")) {
                return fail("[DONE] was not terminated by a blank line");
            }
            if (line.startsWith(":")) continue;
            if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).replace(/^ /, ""));
            }
        }
        if (dataLines.length) {
            return fail("stream ended with an unterminated SSE event");
        }
        if (!done) return fail("stream is missing [DONE]");
        return { content, usage };
    } catch (err) {
        return fail(err.message);
    }
}

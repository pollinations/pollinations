// Keep useful diagnosis without persisting raw upstream bodies or credentials.
export function probeErrorDetails(error) {
    const safeText = (value) =>
        typeof value === "string"
            ? value
                  .replace(/https?:\/\/[^\s"<>]+/gi, "[URL]")
                  .replace(/Bearer\s+[^\s"<>]+/gi, "Bearer [redacted]")
                  .replace(
                      /\b(?:sk_|pk_|sk-|ghp_|github_pat_)[A-Za-z0-9_-]+/g,
                      "[redacted]",
                  )
                  .replace(/[\r\n\t]+/g, " ")
                  .slice(0, 300)
            : null;
    const upstreamStatus = error?.details?.upstreamStatus;
    return {
        errorCode:
            typeof error?.code === "number" && Number.isInteger(error.code)
                ? String(error.code)
                : safeText(error?.code),
        errorMessage: safeText(
            typeof error === "string" ? error : error?.message,
        ),
        upstreamStatus:
            Number.isInteger(upstreamStatus) &&
            upstreamStatus >= 400 &&
            upstreamStatus <= 599
                ? upstreamStatus
                : null,
    };
}

export function hasChatProbeMarker(content, marker) {
    if (typeof content !== "string") return false;
    const finalContent = content
        .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "");
    // Do not accept a copy of the marker from unfinished reasoning.
    return (
        !/<(?:thought|think)>/i.test(finalContent) &&
        finalContent.toLowerCase().includes(marker.toLowerCase())
    );
}

export function parseChatStream(body) {
    let content = "";
    let usage;
    let done = false;
    let dataLines = [];
    let errorDetails;

    const fail = (protocolError) => ({
        content,
        usage,
        protocolError,
        ...errorDetails,
    });
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
            if (chunk?.error) errorDetails = probeErrorDetails(chunk.error);
            throw new Error(
                chunk?.error?.code === "usage_missing"
                    ? "stream returned usage_missing: missing or invalid token usage"
                    : chunk?.error
                      ? "stream returned an error event"
                      : "stream event is missing a choices array",
            );
        }
        for (const choice of chunk.choices) {
            if (choice?.finish_reason === "error") {
                errorDetails = probeErrorDetails(choice.error);
                throw new Error("stream ended with finish_reason=error");
            }
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

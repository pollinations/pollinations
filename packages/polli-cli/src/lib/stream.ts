/**
 * Gen answers some failed completions with HTTP 200: a top-level `error`, or
 * a choice that finished with `finish_reason: "error"`.
 */
export function throwIfFailed(completion: {
    error?: { message?: string };
    choices?: {
        finish_reason?: string | null;
        error?: { message?: string };
    }[];
}): void {
    const failed = completion.choices?.find(
        (choice) => choice.finish_reason === "error",
    );
    const error = completion.error ?? failed?.error;
    if (!error && !failed) return;
    throw new Error(
        error?.message ?? (error ? JSON.stringify(error) : "Completion failed"),
    );
}

/**
 * Zero-dependency SSE stream parser for OpenAI-compatible chat completions.
 * Yields content (or refusal) delta strings as they arrive.
 */
export async function* streamSSE(
    response: Response,
    onEvent?: (event: {
        model?: string;
        usage?: { total_tokens?: number };
        choices?: { finish_reason?: string | null }[];
    }) => void,
): AsyncGenerator<string, void> {
    for await (const event of sseEvents(response)) {
        const parsed = event as {
            error?: { message?: string };
            choices?: {
                delta?: { content?: string; refusal?: string };
                finish_reason?: string | null;
                error?: { message?: string };
            }[];
            model?: string;
            usage?: { total_tokens?: number };
        };
        throwIfFailed(parsed);
        onEvent?.(parsed);
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) yield delta.content;
        if (delta?.refusal) yield delta.refusal;
    }
}

/** Yields each SSE data payload as parsed JSON until [DONE]. */
export async function* sseEvents(
    response: Response,
): AsyncGenerator<Record<string, unknown>, void> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    // One `data:` line: the terminating [DONE], a parsed event, or neither.
    const parseLine = (
        line: string,
    ): { done: boolean; event?: Record<string, unknown> } => {
        if (!line.startsWith("data:")) return { done: false };
        const data = line.slice(5).trim();
        if (data === "[DONE]") return { done: true };
        try {
            return { done: false, event: JSON.parse(data) };
        } catch {
            // A malformed payload is skipped, as before.
            return { done: false };
        }
    };

    let complete = false;
    try {
        while (!complete) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                const parsed = parseLine(line);
                complete = parsed.done;
                if (complete) break;
                if ("event" in parsed)
                    yield parsed.event as Record<string, unknown>;
            }
        }
        // A stream may end right after its last line, without the trailing
        // newline; that buffered line is still a complete event.
        if (!complete) {
            buffer += decoder.decode();
            const parsed = parseLine(buffer);
            complete = parsed.done;
            if ("event" in parsed)
                yield parsed.event as Record<string, unknown>;
        }
        if (!complete) throw new Error("Stream interrupted before [DONE]");
    } finally {
        await reader.cancel().catch(() => undefined);
    }
}

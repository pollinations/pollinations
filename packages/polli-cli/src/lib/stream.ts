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
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) throw new Error("Stream interrupted before [DONE]");

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") return;

            let parsed: {
                error?: { message?: string };
                choices?: {
                    delta?: { content?: string; refusal?: string };
                    finish_reason?: string | null;
                }[];
                model?: string;
                usage?: { total_tokens?: number };
            };
            try {
                parsed = JSON.parse(data);
            } catch {
                continue;
            }
            if (parsed.error) {
                throw new Error(
                    parsed.error.message ?? JSON.stringify(parsed.error),
                );
            }
            onEvent?.(parsed);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) yield delta.content;
            if (delta?.refusal) yield delta.refusal;
        }
    }
}

/** Yields each SSE data payload as parsed JSON until [DONE] or the end of
 * the body; callers decide whether the stream finished. */
export async function* sseEvents(
    response: Response,
): AsyncGenerator<Record<string, unknown>, void> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) return;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                if (data === "[DONE]") return;
                let parsed: Record<string, unknown>;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    continue;
                }
                yield parsed;
            }
        }
    } finally {
        await reader.cancel().catch(() => undefined);
    }
}

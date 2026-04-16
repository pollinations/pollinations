/**
 * Zero-dependency SSE stream parser for OpenAI-compatible chat completions.
 * Yields content delta strings as they arrive.
 */
export async function* streamSSE(
    response: Response,
): AsyncGenerator<string, void> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") return;

            let parsed: {
                error?: { message?: string };
                choices?: { delta?: { content?: string } }[];
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
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) yield delta;
        }
    }
}

import { gen } from "../lib/api.js";

/**
 * A one-word chat completion under the dedicated key, run once at the end of
 * `on`. It is the cheapest possible proof that the key and model actually
 * work end to end (and bills the dedicated key, not the account key) before
 * the harness is reported ready.
 */
export const smokeTest = async (
    apiKey: string,
    model: string,
): Promise<void> => {
    const response = await gen<{
        choices?: { message?: { content?: string } }[];
    }>("/v1/chat/completions", {
        method: "POST",
        apiKey,
        body: {
            model,
            messages: [
                {
                    role: "user",
                    content: 'Reply with exactly one word: "pong".',
                },
            ],
            max_tokens: 5,
        },
    });
    const reply = response.choices?.[0]?.message?.content ?? "";
    if (!/pong/i.test(reply)) {
        throw new Error(
            `Smoke test failed: model "${model}" did not reply with "pong" (got: ${reply.slice(0, 80) || "<empty>"}).`,
        );
    }
};

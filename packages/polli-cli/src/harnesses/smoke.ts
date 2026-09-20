import { ApiError, gen } from "../lib/api.js";

export interface SmokeResult {
    ok: boolean;
    detail: string;
}

/**
 * Cheap end-to-end check an adapter runs right after wiring a harness: one
 * one-word request under the dedicated key, so a bad key or model fails
 * loudly before the user starts real (paid) work through the router.
 */
export const smokeChat = async (
    apiKey: string,
    model: string,
): Promise<SmokeResult> => {
    try {
        const data = await gen<{
            choices?: Array<{ message?: { content?: string } }>;
        }>("/v1/chat/completions", {
            apiKey,
            method: "POST",
            body: {
                model,
                messages: [
                    {
                        role: "user",
                        content: "Reply with exactly one word: pong",
                    },
                ],
            },
        });
        const reply = (data.choices?.[0]?.message?.content ?? "").trim();
        if (!reply) return { ok: false, detail: "empty reply from the model" };
        return { ok: true, detail: reply.slice(0, 60) };
    } catch (error) {
        if (error instanceof ApiError) {
            return { ok: false, detail: `HTTP ${error.status}` };
        }
        return {
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
        };
    }
};

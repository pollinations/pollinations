// Pollinations chat client — ported from the web app's utils/api.ts, but the
// API key and model are passed in (no localStorage). Same OpenAI-compatible
// endpoint, JSON mode, retry/backoff, and reasoning_effort policy.

import type { PollingsMessage, PollingsResponse } from "./types.js";

const ENDPOINT = "https://gen.pollinations.ai/v1/chat/completions";
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Thrown after all retries fail; carries a short upstream detail so the UI can
// speak it in the game's voice.
export class PollingsError extends Error {
    constructor(readonly detail: string) {
        super(detail);
        this.name = "PollingsError";
    }
}

// Pull the most useful line out of an upstream error body (JSON envelope or text).
const extractDetail = (raw: string): string => {
    try {
        const parsed = JSON.parse(raw);
        return (
            parsed?.error?.message ??
            parsed?.error ??
            parsed?.message ??
            raw
        ).toString();
    } catch {
        return raw;
    }
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchFromPollinations = async (
    messages: PollingsMessage[],
    apiKey: string,
    model: string,
): Promise<PollingsResponse> => {
    const body = JSON.stringify({
        messages,
        model,
        // DeepSeek reasons heavily even at "low" — push it to "none" so replies
        // stay under the timeout; harmless no-op for the non-reasoning models.
        reasoning_effort: model === "deepseek" ? "none" : "low",
        response_format: { type: "json_object" },
        seed: Math.floor(Math.random() * 1000000),
    });

    let lastDetail = "Sub-Etha signal lost";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => "");
                const detail = extractDetail(text).slice(0, 200);
                throw new PollingsError(
                    `HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
                );
            }

            return (await response.json()) as PollingsResponse;
        } catch (error) {
            lastDetail =
                error instanceof PollingsError
                    ? error.detail
                    : (error as Error).message;
            if (attempt < MAX_RETRIES - 1) {
                await delay(RETRY_DELAY * 2 ** attempt);
            }
        }
    }

    throw new PollingsError(lastDetail);
};

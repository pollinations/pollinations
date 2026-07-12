import { getStoredApiKey, getStoredModel } from "@/hooks/ui";
import {
    API_CONFIG,
    type PollingsMessage,
    type PollingsResponse,
} from "@/types";

function createFetchRequest(
    messages: PollingsMessage[],
    jsonMode = true,
): RequestInit {
    const apiKey = getStoredApiKey();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const model = getStoredModel();

    return {
        method: "POST",
        headers,
        body: JSON.stringify({
            messages,
            model,
            // DeepSeek is a reasoning model: even "low" lets it think for
            // thousands of tokens, pushing replies past 10s on the long Guide
            // prompt, so it gets "none". The other (non-reasoning) models stay
            // at "low" — it's a harmless no-op for them.
            reasoning_effort: model === "deepseek" ? "none" : "low",
            response_format: jsonMode ? { type: "json_object" } : undefined,
            seed: Math.floor(Math.random() * 1000000),
        }),
    };
}

// Thrown after all retries fail. Carries a short upstream detail (e.g.
// "HTTP 429: rate limit exceeded") so the UI can speak it in the game's voice.
export class PollingsError extends Error {
    constructor(readonly detail: string) {
        super(detail);
        this.name = "PollingsError";
    }
}

// Pull the most useful line out of an upstream error body, which may be a JSON
// envelope ({error:{message}} / {message}) or plain text.
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

export const retryFetch = async (
    operation: () => Promise<Response>,
    maxAttempts = API_CONFIG.MAX_RETRIES,
): Promise<PollingsResponse> => {
    let lastDetail = "Sub-Etha signal lost";

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const response = await operation();
            if (!response.ok) {
                const body = await response.text().catch(() => "");
                const detail = extractDetail(body).slice(0, 200);
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
            console.warn(
                `Attempt ${attempt + 1}/${maxAttempts} failed:`,
                error,
            );

            if (attempt < maxAttempts - 1) {
                await delay(API_CONFIG.RETRY_DELAY * 2 ** attempt);
            }
        }
    }

    console.error(
        `All ${maxAttempts} attempts failed. Last error:`,
        lastDetail,
    );
    throw new PollingsError(lastDetail);
};

export const fetchFromPollinations = async (
    messages: PollingsMessage[],
    jsonMode = true,
): Promise<PollingsResponse> => {
    return retryFetch(() =>
        fetch(API_CONFIG.ENDPOINT, createFetchRequest(messages, jsonMode)),
    );
};

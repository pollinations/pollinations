import { getStoredApiKey, getStoredModel } from "@/hooks/ui";
import type { PollingsMessage, PollingsResponse } from "@/types";

const ENDPOINT = "https://gen.pollinations.ai/v1/chat/completions";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

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

export const fetchFromPollinations = async (
    messages: PollingsMessage[],
): Promise<PollingsResponse> => {
    let lastDetail = "Sub-Etha signal lost";

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
            const apiKey = getStoredApiKey();
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

            const model = getStoredModel();
            const response = await fetch(ENDPOINT, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    messages,
                    model,
                    reasoning_effort: model === "deepseek" ? "none" : "low",
                    response_format: { type: "json_object" },
                    seed: Math.floor(Math.random() * 1000000),
                }),
            });
            if (!response.ok) {
                const body = await response.text().catch(() => "");
                const detail = extractDetail(body).slice(0, 200);
                throw new Error(
                    `HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
                );
            }

            return (await response.json()) as PollingsResponse;
        } catch (error) {
            lastDetail = error instanceof Error ? error.message : String(error);
            console.warn(
                `Attempt ${attempt + 1}/${MAX_ATTEMPTS} failed:`,
                error,
            );

            if (attempt < MAX_ATTEMPTS - 1) {
                await delay(RETRY_DELAY_MS * 2 ** attempt);
            }
        }
    }

    console.error(
        `All ${MAX_ATTEMPTS} attempts failed. Last error:`,
        lastDetail,
    );
    throw new Error(lastDetail);
};

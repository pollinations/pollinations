import { API, DEFAULTS } from "../api.config";
import { fetchWithRetry } from "../utils/fetchWithRetry";

function authHeaders(apiKey?: string): HeadersInit {
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

/**
 * Fetch text from Pollinations text generation API
 * Includes automatic retry with backoff on 429 rate limit errors
 */
export async function generateText(
    prompt: string,
    seed?: number | number[],
    model = DEFAULTS.TEXT_MODEL,
    apiKey?: string,
): Promise<string> {
    const response = await fetchWithRetry(API.TEXT_GENERATION, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...authHeaders(apiKey),
        },
        body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            model,
            seed,
        }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

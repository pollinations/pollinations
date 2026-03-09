import { API, API_KEY, DEFAULTS } from "../api.config";
import { fetchWithRetry } from "../utils/fetchWithRetry";

/**
 * Fetch text from Pollinations text generation API
 * Includes automatic retry with backoff on 429 rate limit errors
 */
export async function generateText(
    prompt: string,
    seed?: number | number[],
    model = DEFAULTS.TEXT_MODEL,
    apiKey = API_KEY,
): Promise<string> {
    const response = await fetchWithRetry(API.TEXT_GENERATION, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
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

/**
 * Fetch image from Pollinations image generation API
 * Returns object URL (caller should revoke when done)
 * Includes automatic retry with backoff on 429 rate limit errors
 */
export async function generateImage(
    prompt: string,
    options: {
        width?: number;
        height?: number;
        seed?: number;
        model?: string;
        apiKey?: string;
    } = {},
): Promise<string> {
    const {
        width = DEFAULTS.IMAGE_WIDTH,
        height = DEFAULTS.IMAGE_HEIGHT,
        seed = DEFAULTS.SEED,
        model = DEFAULTS.IMAGE_MODEL,
        apiKey = API_KEY,
    } = options;

    const baseUrl = `${API.IMAGE_GENERATION}/${encodeURIComponent(prompt)}`;
    const params = new URLSearchParams();
    if (model) params.set("model", model);
    if (width) params.set("width", width.toString());
    if (height) params.set("height", height.toString());
    if (seed != null) params.set("seed", seed.toString());
    const url = `${baseUrl}?${params.toString()}`;

    const response = await fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

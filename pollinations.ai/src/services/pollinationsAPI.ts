import { API, DEFAULTS, API_KEY } from "../api.config";

const MAX_RETRIES = 3;

/**
 * Helper to wait for a specified number of milliseconds
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parse retryAfterSeconds from 429 error response
 */
function parseRetryAfter(errorText: string): number {
    try {
        const json = JSON.parse(errorText);
        return json.retryAfterSeconds || 15;
    } catch {
        return 15; // Default to 15 seconds if parsing fails
    }
}

/**
 * Fetch text from Pollinations text generation API
 * Includes automatic retry with backoff on 429 rate limit errors
 */
export async function generateText(
    prompt: string,
    seed?: number | number[],
    model?: string,
    signal?: AbortSignal,
): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const response = await fetch(API.TEXT_GENERATION, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: prompt }],
                model: model || DEFAULTS.TEXT_MODEL,
                seed: seed,
            }),
            signal,
        });

        if (response.ok) {
            const data = await response.json();
            return data.choices?.[0]?.message?.content || "";
        }

        const errorText = await response.text();

        if (response.status === 429 && attempt < MAX_RETRIES - 1) {
            const retryAfter = parseRetryAfter(errorText);
            console.log(
                `⏳ Rate limited. Waiting ${retryAfter}s before retry ${attempt + 2}/${MAX_RETRIES}...`,
            );
            await delay(retryAfter * 1000 + 1000); // Add 1s buffer
            continue;
        }

        console.error(`API Error ${response.status}:`, errorText);
        lastError = new Error(`HTTP ${response.status}: ${errorText}`);
    }

    throw lastError || new Error("Max retries exceeded");
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
        nologo?: boolean;
    } = {},
    signal?: AbortSignal,
): Promise<string> {
    const {
        width = DEFAULTS.IMAGE_WIDTH,
        height = DEFAULTS.IMAGE_HEIGHT,
        seed = DEFAULTS.SEED,
        model = DEFAULTS.IMAGE_MODEL,
        nologo = true,
    } = options;

    const baseUrl = `${API.IMAGE_GENERATION}/${encodeURIComponent(prompt)}`;
    const params = new URLSearchParams({
        model: model || "",
        width: width?.toString() || "",
        height: height?.toString() || "",
        seed: seed?.toString() || "",
        nologo: nologo.toString(),
    });
    const url = `${baseUrl}?${params.toString()}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${API_KEY}` },
            signal,
        });

        if (response.ok) {
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        }

        const errorText = await response.text();

        if (response.status === 429 && attempt < MAX_RETRIES - 1) {
            const retryAfter = parseRetryAfter(errorText);
            console.log(
                `⏳ Rate limited. Waiting ${retryAfter}s before retry ${attempt + 2}/${MAX_RETRIES}...`,
            );
            await delay(retryAfter * 1000 + 1000);
            continue;
        }

        lastError = new Error(`HTTP ${response.status}: ${errorText}`);
    }

    throw lastError || new Error("Max retries exceeded");
}

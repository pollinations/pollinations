import { API, DEFAULTS } from "../api.config";

/**
 * Fetch text from Pollinations text generation API
 */
export async function generateText(
    prompt: string,
    apiKey: string,
    seed?: number | number[],
    model?: string,
    signal?: AbortSignal,
): Promise<string> {
    const response = await fetch(API.TEXT_GENERATION, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            model: model || DEFAULTS.TEXT_MODEL,
            seed: seed,
        }),
        signal,
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error ${response.status}:`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

/**
 * Fetch image from Pollinations image generation API
 * Returns object URL (caller should revoke when done)
 */
export async function generateImage(
    prompt: string,
    apiKey: string,
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

    const response = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
        signal,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

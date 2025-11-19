import { useState, useEffect } from "react";
import { API, DEFAULTS, API_KEY } from "../config/api";

interface ImageGenerationOptions {
    prompt: string;
    width?: number;
    height?: number;
    seed?: number;
    model?: string;
    nologo?: boolean;
    alt?: string;
}

interface UseImageGenerationReturn {
    imageUrl: string | null;
    loading: boolean;
    error: any;
}

export function useImageGeneration({
    prompt,
    width = DEFAULTS.IMAGE_WIDTH,
    height = DEFAULTS.IMAGE_HEIGHT,
    seed = DEFAULTS.SEED,
    model = DEFAULTS.IMAGE_MODEL,
    nologo = true,
    alt = "Generated image",
}: ImageGenerationOptions): UseImageGenerationReturn {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (!prompt) {
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        const signal = controller.signal;
        let objectUrl: string | null = null;

        setLoading(true);
        setError(null);

        async function fetchImage() {
            try {
                const baseUrl = `${API.IMAGE_GENERATION}/${encodeURIComponent(prompt)}`;
                const params = new URLSearchParams({
                    model: model || "",
                    width: width?.toString() || "",
                    height: height?.toString() || "",
                    seed: seed?.toString() || "",
                    nologo: nologo.toString(),
                });
                const url = `${baseUrl}?${params.toString()}`;

                const headers = {
                    Authorization: `Bearer ${API_KEY}`,
                };

                const response = await fetch(url, {
                    method: "GET",
                    headers: headers,
                    signal,
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const blob = await response.blob();

                if (!signal.aborted) {
                    objectUrl = URL.createObjectURL(blob);
                    setImageUrl(objectUrl);
                    setLoading(false);
                }
            } catch (err: any) {
                if (err.name === "AbortError") {
                    return;
                }
                console.error(`Error generating image "${alt}":`, err);
                if (!signal.aborted) {
                    setError(err);
                    setLoading(false);
                }
            }
        }

        fetchImage();

        return () => {
            controller.abort();
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [prompt, width, height, seed, model, nologo, alt]);

    return { imageUrl, loading, error };
}

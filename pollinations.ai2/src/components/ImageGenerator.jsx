// ImageGenerator component - generates images using enter.pollinations.ai API with auth
// Usage: <ImageGenerator prompt="your prompt" width={400} height={400} />

import { useState, useEffect } from "react";

const API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY;

export function ImageGenerator({
    prompt,
    width = 400,
    height = 400,
    seed = 42,
    model = "flux",
    nologo = true,
    alt = "Generated image",
    className = "",
    ...props
}) {
    const [imageUrl, setImageUrl] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let objectUrl = null;
        let cancelled = false;

        async function fetchImage() {
            try {
                const baseUrl = `https://enter.pollinations.ai/api/generate/image/${encodeURIComponent(
                    prompt
                )}`;
                const params = new URLSearchParams({
                    model: model,
                    width: width.toString(),
                    height: height.toString(),
                    seed: seed.toString(),
                    nologo: "true",
                });
                const url = `${baseUrl}?${params.toString()}`;

                const headers = {
                    Authorization: `Bearer ${API_KEY}`,
                };

                const response = await fetch(url, {
                    method: "GET",
                    headers: headers,
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(
                        `❌ HTTP Error for "${alt}":`,
                        response.status,
                        errorText
                    );
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const blob = await response.blob();

                if (!cancelled) {
                    objectUrl = URL.createObjectURL(blob);
                    setImageUrl(objectUrl);
                    setLoading(false);
                }
            } catch (error) {
                console.error(`🔴 COMPLETE ERROR for "${alt}":`, {
                    message: error.message,
                    stack: error.stack,
                    error: error,
                });
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        fetchImage();

        return () => {
            cancelled = true;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [prompt, model, width, height, seed, alt]);

    if (loading) {
        return (
            <div
                className={`${className} flex items-center justify-center bg-offblack/5`}
                style={{ width, height }}
                {...props}
            >
                <span className="text-xs text-offblack/40">...</span>
            </div>
        );
    }

    if (!imageUrl) {
        return (
            <div
                className={`${className} flex items-center justify-center bg-offblack/5`}
                style={{ width, height }}
                {...props}
            >
                <span className="text-xs text-offblack/40">✗</span>
            </div>
        );
    }

    return (
        <img
            src={imageUrl}
            alt={alt}
            width={width}
            height={height}
            className={className}
            {...props}
        />
    );
}

// Helper function to generate image URL (for use in other contexts)
export function generateImageUrl({
    prompt,
    width = 400,
    height = 400,
    seed = 42,
    model = "flux",
    nologo = true,
}) {
    const baseUrl = `https://enter.pollinations.ai/api/generate/image/${encodeURIComponent(
        prompt
    )}`;
    const params = new URLSearchParams({
        model: model,
        width: width.toString(),
        height: height.toString(),
        seed: seed.toString(),
        nologo: nologo.toString(),
    });
    return `${baseUrl}?${params.toString()}`;
}

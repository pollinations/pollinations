// ImageGenerator component - generates images using enter.pollinations.ai API with auth
// Usage: <ImageGenerator prompt="your prompt" width={400} height={400} />

import { useState, useEffect } from "react";

const API_KEY = "plln_sk_2d1YAgFDvIjAKPZ1mOFVCGiYNTluWhmc";

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

        console.log(
            `🔵 ImageGenerator mounted for "${alt}" with prompt:`,
            prompt.substring(0, 50) + "..."
        );

        async function fetchImage() {
            try {
                const url = new URL(
                    "https://enter.pollinations.ai/api/generate/image"
                );
                url.searchParams.set("prompt", prompt);
                url.searchParams.set("model", model);
                url.searchParams.set("width", width.toString());
                url.searchParams.set("height", height.toString());
                url.searchParams.set("seed", seed.toString());
                url.searchParams.set("nologo", "true");

                console.log(`🚀 Starting fetch for "${alt}":`, url.toString());
                console.log(
                    `🔑 Using API Key:`,
                    API_KEY.substring(0, 15) + "..."
                );

                const headers = {
                    Authorization: `Bearer ${API_KEY}`,
                };
                console.log(`📋 Request headers:`, headers);

                const response = await fetch(url.toString(), {
                    method: "GET",
                    headers: headers,
                });

                console.log(
                    `📡 Response received for "${alt}":`,
                    response.status,
                    response.statusText
                );

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
                console.log(
                    `📦 Blob created for "${alt}":`,
                    blob.size,
                    "bytes",
                    blob.type
                );

                if (!cancelled) {
                    objectUrl = URL.createObjectURL(blob);
                    console.log(
                        `🔗 Object URL created for "${alt}":`,
                        objectUrl
                    );
                    setImageUrl(objectUrl);
                    setLoading(false);
                    console.log(`✅ Image fully loaded for "${alt}"`);
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
    const url = new URL(
        "https://enter.pollinations.ai/api/generate/image/flux"
    );

    url.searchParams.set("prompt", prompt);
    url.searchParams.set("width", width.toString());
    url.searchParams.set("height", height.toString());
    url.searchParams.set("seed", seed.toString());
    url.searchParams.set("nologo", nologo.toString());

    return url.toString();
}

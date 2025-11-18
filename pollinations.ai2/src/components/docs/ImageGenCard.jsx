import { useState, useEffect } from "react";
import { Heading, Label } from "../ui/typography";
import { Button } from "../ui/button";

const API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY;

// Nature-themed prompt presets
const IMAGE_PROMPTS = [
    "a blooming flower in golden hour",
    "bees pollinating wildflowers",
    "organic mycelium network patterns",
    "harmonious forest ecosystem",
    "symbiotic nature interactions",
    "flowing river through biosphere",
];

/**
 * Image Generation Card Component
 * Interactive demo for the image generation API
 */
export function ImageGenCard() {
    const [selectedPrompt, setSelectedPrompt] = useState(IMAGE_PROMPTS[0]);
    const [params, setParams] = useState(new Set());
    const [imageUrl, setImageUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const toggleParam = (param) => {
        const newParams = new Set(params);
        if (newParams.has(param)) {
            newParams.delete(param);
        } else {
            newParams.add(param);
        }
        setParams(newParams);
    };

    const buildUrl = () => {
        let url = `https://enter.pollinations.ai/api/generate/image/${encodeURIComponent(
            selectedPrompt
        )}`;
        const urlParams = new URLSearchParams();
        if (params.size > 0) {
            Array.from(params).forEach((p) => {
                const [key, value] = p.split("=");
                urlParams.append(key, value);
            });
        }
        // Add default model if not specified
        if (!Array.from(params).some((p) => p.startsWith("model="))) {
            urlParams.append("model", "flux");
        }
        const paramString = urlParams.toString();
        if (paramString) {
            url += "?" + paramString;
        }
        return url;
    };

    useEffect(() => {
        const buildImageUrl = () => {
            let url = `https://enter.pollinations.ai/api/generate/image/${encodeURIComponent(
                selectedPrompt
            )}`;
            const urlParams = new URLSearchParams();
            if (params.size > 0) {
                Array.from(params).forEach((p) => {
                    const [key, value] = p.split("=");
                    urlParams.append(key, value);
                });
            }
            // Add default model if not specified
            if (!Array.from(params).some((p) => p.startsWith("model="))) {
                urlParams.append("model", "flux");
            }
            const paramString = urlParams.toString();
            if (paramString) {
                url += "?" + paramString;
            }
            return url;
        };

        const fetchImage = async () => {
            setIsLoading(true);
            try {
                const url = buildImageUrl();
                const response = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${API_KEY}`,
                    },
                });
                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}: ${response.statusText}`
                    );
                }
                const blob = await response.blob();
                const imageURL = URL.createObjectURL(blob);
                setImageUrl(imageURL);
                setIsLoading(false);
            } catch (error) {
                console.error("Image fetch error:", error);
                setIsLoading(false);
            }
        };

        fetchImage();
    }, [selectedPrompt, params]);

    // Cleanup blob URLs
    useEffect(() => {
        return () => {
            if (imageUrl?.startsWith("blob:")) {
                URL.revokeObjectURL(imageUrl);
            }
        };
    }, [imageUrl]);

    return (
        <div>
            <Heading variant="section">Image Generation</Heading>

            {/* Prompts/Parameters and Image Preview - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Left side: Prompts and Parameters */}
                <div className="space-y-4">
                    {/* Prompt Selection */}
                    <div>
                        <Label>Pick a prompt</Label>
                        <div className="flex flex-wrap gap-2">
                            {IMAGE_PROMPTS.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    onClick={() => setSelectedPrompt(prompt)}
                                    className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                        selectedPrompt === prompt
                                            ? "bg-lime/90 border-rose font-black shadow-rose-sm"
                                            : "bg-offblack/10 border-offblack/30 hover:border-rose"
                                    }`}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Optional Parameters */}
                    <div>
                        <Label>Optional parameters</Label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                "model=nanobanana",
                                "width=1024",
                                "height=1024",
                                "seed=42",
                                "enhance=true",
                                "nologo=true",
                            ].map((param) => (
                                <button
                                    key={param}
                                    type="button"
                                    onClick={() => toggleParam(param)}
                                    className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                        params.has(param)
                                            ? "bg-lime/90 border-rose font-black shadow-rose-sm"
                                            : "bg-offblack/10 border-offblack/30 hover:border-rose"
                                    }`}
                                >
                                    {param}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right side: Image Preview (no label) */}
                <div className="bg-offblack/5 p-3 flex items-center justify-center min-h-[300px]">
                    {isLoading ? (
                        <p className="text-offblack/50 text-xs">
                            Generating...
                        </p>
                    ) : imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={selectedPrompt}
                            className="w-full h-auto object-contain"
                        />
                    ) : null}
                </div>
            </div>

            {/* URL Display */}
            <div className="mb-4 p-3 bg-offblack/5 font-mono text-xs break-all">
                <span className="text-offblack/40">
                    https://enter.pollinations.ai/api/generate/image/
                </span>
                <span className="bg-lime/90 px-1 font-black">
                    {selectedPrompt}
                </span>
                {params.size > 0 && (
                    <>
                        <span className="text-offblack/40">?</span>
                        {Array.from(params).map((param, i) => (
                            <span key={param}>
                                {i > 0 && (
                                    <span className="text-offblack/40">&</span>
                                )}
                                <span className="bg-lime/90 px-1 font-black">
                                    {param}
                                </span>
                            </span>
                        ))}
                    </>
                )}
            </div>

            {/* Copy Button */}
            <Button
                type="button"
                onClick={() => navigator.clipboard.writeText(buildUrl())}
                variant="copy"
                size={null}
            >
                Copy URL
            </Button>
        </div>
    );
}

import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import type { Model } from "../../../hooks/useModelList";

import { PLAY_PAGE } from "../../../theme";
import { API_BASE } from "../../../api.config";

interface PlayGeneratorProps {
    selectedModel: string;
    prompt: string;
    onPromptChange?: (prompt: string) => void;
    imageModels: Model[];
    textModels: Model[];
    apiKey: string;
}

/**
 * PlayGenerator Component
 * Main generation interface for the Play page
 * Handles prompt input, parameters, and generation
 * Model selection is managed by parent PlayPage
 */
// Helper to extract error message from API response
const extractErrorMessage = async (response: Response): Promise<string> => {
    try {
        const data = await response.json();
        // Handle nested error structure: { error: { message: "{...}" } }
        if (data?.error?.message) {
            try {
                const nested = JSON.parse(data.error.message);
                return nested?.message || data.error.message;
            } catch {
                return data.error.message;
            }
        }
        return data?.message || data?.error || "Something went wrong";
    } catch {
        return `Error ${response.status}: ${response.statusText}`;
    }
};

export function PlayGenerator({
    selectedModel,
    prompt,
    imageModels,
    textModels,
    apiKey,
}: PlayGeneratorProps) {
    const [result, setResult] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Cleanup blob URLs when result changes
    useEffect(() => {
        return () => {
            if (result?.startsWith("blob:")) {
                URL.revokeObjectURL(result);
            }
        };
    }, [result]);

    // Image parameters
    const [width, setWidth] = useState(1024);
    const [height, setHeight] = useState(1024);
    const [seed, setSeed] = useState(0);
    const [enhance, setEnhance] = useState(false);
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [imageUrlInput, setImageUrlInput] = useState("");

    const isImageModel = imageModels.some((m) => m.id === selectedModel);

    // Check if current model has audio output
    const isAudioModel = [...imageModels, ...textModels].some(
        (m) => m.id === selectedModel && m.hasAudioOutput,
    );

    // Check if current model supports image input modality
    const currentModelData = [...imageModels, ...textModels].find(
        (m) => m.id === selectedModel,
    );
    const supportsImageInput = currentModelData?.hasImageInput || false;

    const addImageUrl = () => {
        if (imageUrlInput.trim() && imageUrls.length < 4) {
            setImageUrls([...imageUrls, imageUrlInput.trim()]);
            setImageUrlInput("");
        }
    };

    const handleGenerate = async () => {
        setIsLoading(true);
        setError(null);

        if (isImageModel) {
            try {
                const params = new URLSearchParams({
                    model: selectedModel,
                    width: width.toString(),
                    height: height.toString(),
                    seed: seed.toString(),
                    enhance: enhance.toString(),
                });

                // Add reference images for image-to-image generation (pipe-separated)
                if (imageUrls.length > 0) {
                    params.set("image", imageUrls.join("|"));
                }

                const response = await fetch(
                    `${API_BASE}/image/${encodeURIComponent(prompt)}?${params}`,
                    { headers: { Authorization: `Bearer ${apiKey}` } },
                );

                if (!response.ok) {
                    const errorMsg = await extractErrorMessage(response);
                    setError(errorMsg);
                    setResult(null);
                    setIsLoading(false);
                    return;
                }

                const blob = await response.blob();
                const imageURL = URL.createObjectURL(blob);
                setResult(imageURL);
                setIsLoading(false);
            } catch (err) {
                console.error("Image generation error:", err);
                setError(
                    err instanceof Error ? err.message : "Something went wrong",
                );
                setResult(null);
                setIsLoading(false);
            }
        } else {
            try {
                const content =
                    imageUrls.length > 0
                        ? [
                              {
                                  type: "text",
                                  text: prompt,
                              },
                              ...imageUrls.map((url: string) => ({
                                  type: "image_url",
                                  image_url: { url },
                              })),
                          ]
                        : prompt;

                const response = await fetch(
                    `${API_BASE}/v1/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify({
                            model: selectedModel,
                            messages: [
                                {
                                    role: "user",
                                    content,
                                },
                            ],
                        }),
                    },
                );

                if (!response.ok) {
                    const errorMsg = await extractErrorMessage(response);
                    setError(errorMsg);
                    setResult(null);
                    setIsLoading(false);
                    return;
                }

                const data = await response.json();
                const text =
                    data.choices?.[0]?.message?.content || "No response";
                setResult(text);
                setIsLoading(false);
            } catch (err) {
                console.error("Text generation error:", err);
                setError(
                    err instanceof Error ? err.message : "Something went wrong",
                );
                setResult(null);
                setIsLoading(false);
            }
        }
    };

    return (
        <>
            {/* Reference Images (only for models with image input modality) */}
            {supportsImageInput && (
                <div className="mb-6">
                    <div className="flex items-baseline gap-2 mb-2">
                        <label
                            htmlFor="image-url"
                            className="font-headline text-text-body-main uppercase text-xs tracking-wider font-black"
                        >
                            Reference images
                        </label>
                        <span className="font-body text-[10px] text-text-caption">
                            {imageUrls.length}/4 images
                        </span>
                    </div>
                    {/* Thumbnails of added images */}
                    {imageUrls.length > 0 && (
                        <div className="flex gap-2 mb-2 flex-wrap">
                            {imageUrls.map((url, index) => (
                                <div key={index} className="relative">
                                    <img
                                        src={url}
                                        alt={`Reference ${index + 1}`}
                                        className="w-16 h-16 object-cover rounded-input border-2 border-border-strong"
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setImageUrls(
                                                imageUrls.filter(
                                                    (_, i) => i !== index,
                                                ),
                                            )
                                        }
                                        className="absolute -top-1 -right-1 w-5 h-5 bg-charcoal border border-border-main rounded-full flex items-center justify-center text-text-body-main hover:bg-button-secondary-bg transition-colors"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* URL input with add button */}
                    <div className="flex gap-2">
                        <input
                            id="image-url"
                            name="image-url"
                            type="text"
                            value={imageUrlInput}
                            onChange={(e) => setImageUrlInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addImageUrl();
                                }
                            }}
                            placeholder="Image URL"
                            className="flex-1 p-3 bg-input-background text-text-body-main font-body focus:outline-none focus:bg-input-background hover:bg-input-background transition-colors placeholder:text-text-caption rounded-input"
                            disabled={imageUrls.length >= 4}
                        />
                        <button
                            type="button"
                            onClick={addImageUrl}
                            disabled={
                                !imageUrlInput.trim() || imageUrls.length >= 4
                            }
                            className="px-4 bg-button-secondary-bg text-text-body-main font-headline font-black text-xl rounded-input hover:bg-button-secondary-bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            +
                        </button>
                    </div>
                </div>
            )}

            {/* Image Parameters (only show for image models) */}
            {isImageModel && (
                <div className="mb-6">
                    {/* Responsive auto-fill grid: fills rows completely */}
                    <div
                        className="grid gap-3"
                        style={{
                            gridTemplateColumns:
                                "repeat(auto-fit, minmax(120px, 1fr))",
                        }}
                    >
                        <div>
                            <label
                                htmlFor="image-width"
                                className="block font-headline text-text-body-main mb-2 uppercase text-xs tracking-wider font-black"
                            >
                                {PLAY_PAGE.widthLabel.text}
                            </label>
                            <input
                                id="image-width"
                                name="image-width"
                                type="number"
                                value={width}
                                onChange={(e) =>
                                    setWidth(Number(e.target.value))
                                }
                                className="w-full p-3 bg-input-background text-text-body-main font-body focus:outline-none focus:bg-input-background hover:bg-input-background transition-colors rounded-input"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="image-height"
                                className="block font-headline text-text-body-main mb-2 uppercase text-xs tracking-wider font-black"
                            >
                                {PLAY_PAGE.heightLabel.text}
                            </label>
                            <input
                                id="image-height"
                                name="image-height"
                                type="number"
                                value={height}
                                onChange={(e) =>
                                    setHeight(Number(e.target.value))
                                }
                                className="w-full p-3 bg-input-background text-text-body-main font-body focus:outline-none focus:bg-input-background hover:bg-input-background transition-colors rounded-input"
                            />
                        </div>
                        <div>
                            <div className="relative group/seed inline-block">
                                <label
                                    htmlFor="image-seed"
                                    className="block font-headline text-text-body-main mb-2 uppercase text-xs tracking-wider font-black cursor-help"
                                >
                                    {PLAY_PAGE.seedLabel.text}
                                </label>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-charcoal text-text-body-main text-xs rounded-input shadow-lg border border-border-main opacity-0 group-hover/seed:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    Same seed + same prompt = same image
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-charcoal" />
                                </div>
                            </div>
                            <input
                                id="image-seed"
                                name="image-seed"
                                type="number"
                                value={seed}
                                onChange={(e) =>
                                    setSeed(Number(e.target.value))
                                }
                                placeholder={PLAY_PAGE.seedPlaceholder.text}
                                className="w-full p-3 bg-input-background text-text-body-main font-body focus:outline-none focus:bg-input-background hover:bg-input-background transition-colors placeholder:text-text-caption rounded-input"
                            />
                        </div>
                        <div>
                            <div className="relative group/enhance inline-block">
                                <label
                                    htmlFor="enhance-prompt"
                                    className="block font-headline text-text-body-main mb-2 uppercase text-xs tracking-wider font-black cursor-help"
                                >
                                    {PLAY_PAGE.enhanceLabel.text}
                                </label>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-charcoal text-text-body-main text-xs rounded-input shadow-lg border border-border-main opacity-0 group-hover/enhance:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    AI improves your prompt for better results
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-charcoal" />
                                </div>
                            </div>
                            <label className="relative flex items-center justify-center h-[52px] bg-input-background hover:bg-input-background transition-colors cursor-pointer select-none group">
                                <input
                                    id="enhance-prompt"
                                    name="enhance-prompt"
                                    type="checkbox"
                                    checked={enhance}
                                    onChange={(e) =>
                                        setEnhance(e.target.checked)
                                    }
                                    className="sr-only peer"
                                />
                                <div className="w-6 h-6 border-4 border-border-brand bg-input-background peer-checked:bg-button-secondary-bg transition-colors group-hover:border-border-brand rounded-input" />
                                <svg
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 text-text-body-main opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    aria-label="Checkmark"
                                >
                                    <path
                                        strokeLinecap="square"
                                        strokeLinejoin="miter"
                                        strokeWidth="4"
                                        d="M5 13l4 4L19 7"
                                    />
                                </svg>
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Generate Button */}
            <div className="relative group/generate inline-block mb-6">
                <Button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!prompt || isLoading}
                    variant="generate"
                    size={null}
                    className={isLoading ? "animate-pulse" : ""}
                    data-type={
                        isAudioModel ? "audio" : isImageModel ? "image" : "text"
                    }
                >
                    {isLoading ? (
                        <span className="flex items-center gap-2">
                            <span className="flex gap-1">
                                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
                            </span>
                            {PLAY_PAGE.generatingText.text}
                        </span>
                    ) : isAudioModel ? (
                        "Generate Audio"
                    ) : isImageModel ? (
                        PLAY_PAGE.generateImageButton.text
                    ) : (
                        PLAY_PAGE.generateTextButton.text
                    )}
                </Button>
                {!prompt && !isLoading && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-charcoal text-text-body-main text-xs rounded-input shadow-lg border border-border-main opacity-0 group-hover/generate:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        First, enter a prompt
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-charcoal" />
                    </div>
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div className="mb-6 p-4 bg-surface-card border border-border-strong rounded-input text-text-body-main font-body text-sm">
                    {error}
                </div>
            )}

            {/* Result Display */}
            {result && !error && (
                <div className={isImageModel ? "" : "bg-input-background p-6"}>
                    {isImageModel ? (
                        <img
                            src={result}
                            alt="Generated"
                            className="w-full h-auto"
                            onLoad={() => setIsLoading(false)}
                        />
                    ) : (
                        <div className="font-body text-text-body-main whitespace-pre-wrap">
                            {result}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

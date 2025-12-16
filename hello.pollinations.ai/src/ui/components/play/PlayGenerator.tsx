import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { CloseIcon } from "../../assets/CloseIcon";
import type { Model } from "../../../hooks/useModelList";

import { PLAY_PAGE } from "../../../theme";
import { API_KEY } from "../../../api.config";

interface PlayGeneratorProps {
    selectedModel: string;
    prompt: string;
    onPromptChange?: (prompt: string) => void;
    imageModels: Model[];
    textModels: Model[];
}

/**
 * PlayGenerator Component
 * Main generation interface for the Play page
 * Handles prompt input, parameters, and generation
 * Model selection is managed by parent PlayPage
 */
// Error messages for different error types
const ERROR_MESSAGES = {
    RATE_LIMIT: "⏳ Rate limit reached. Please wait a moment and try again.",
    FORBIDDEN:
        "🔒 Access denied. You may need to log in to enter.pollinations.ai for this model.",
    GENERIC:
        "⚠️ Something went wrong. Please try again or choose a different model.",
};

export function PlayGenerator({
    selectedModel,
    prompt,
    imageModels,
    textModels,
}: PlayGeneratorProps) {
    const [result, setResult] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [uploadedImages, setUploadedImages] = useState<string[]>([]);

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
    const [nologo, setNologo] = useState(true);

    const isImageModel = imageModels.some((m) => m.id === selectedModel);

    // Check if current model has audio output
    const isAudioModel = [...imageModels, ...textModels].some(
        (m) => m.id === selectedModel && m.hasAudioOutput
    );

    // Check if current model supports image input modality
    const currentModelData = [...imageModels, ...textModels].find(
        (m) => m.id === selectedModel
    );
    const supportsImageInput = currentModelData?.hasImageInput || false;

    // Check if current model has video output
    const isVideoModel = currentModelData?.hasVideoOutput || false;

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
                    nologo: nologo.toString(),
                });

                const response = await fetch(
                    `https://enter.pollinations.ai/api/generate/image/${encodeURIComponent(
                        prompt
                    )}?${params}`,
                    {
                        headers: {
                            Authorization: `Bearer ${API_KEY}`,
                        },
                    }
                );

                if (!response.ok) {
                    if (response.status === 429) {
                        setError(ERROR_MESSAGES.RATE_LIMIT);
                    } else if (response.status === 403) {
                        setError(ERROR_MESSAGES.FORBIDDEN);
                    } else {
                        setError(ERROR_MESSAGES.GENERIC);
                    }
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
                setError(ERROR_MESSAGES.GENERIC);
                setResult(null);
                setIsLoading(false);
            }
        } else {
            try {
                const content =
                    uploadedImages.length > 0
                        ? [
                              {
                                  type: "text",
                                  text: prompt,
                              },
                              ...uploadedImages.map((img) => ({
                                  type: "image_url",
                                  image_url: { url: img },
                              })),
                          ]
                        : prompt;

                // Use video key for video models, text key otherwise
                const textApiKey = API_KEY;

                const response = await fetch(
                    "https://enter.pollinations.ai/api/generate/v1/chat/completions",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${API_KEY}`,
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
                    }
                );

                if (!response.ok) {
                    if (response.status === 429) {
                        setError(ERROR_MESSAGES.RATE_LIMIT);
                    } else if (response.status === 403) {
                        setError(ERROR_MESSAGES.FORBIDDEN);
                    } else {
                        setError(ERROR_MESSAGES.GENERIC);
                    }
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
                setError(ERROR_MESSAGES.GENERIC);
                setResult(null);
                setIsLoading(false);
            }
        }
    };

    return (
        <>
            {/* Image Upload (only for models with image input modality) */}
            {supportsImageInput && (
                <div className="mb-6">
                    <div className="flex items-baseline gap-2 mb-2">
                        <label className="font-headline text-text-body-main uppercase text-xs tracking-wider font-black">
                            {PLAY_PAGE.addImagesLabel.text}
                        </label>
                        <span className="font-body text-[10px] text-text-caption">
                            {PLAY_PAGE.upToFourLabel.text}
                        </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 max-w-xs">
                        {[...Array(4)].map((_, index) => {
                            const hasImage = uploadedImages[index];
                            return (
                                <div
                                    key={`upload-${index}`}
                                    className="relative aspect-square"
                                >
                                    {hasImage ? (
                                        <>
                                            <img
                                                src={hasImage}
                                                alt={`Upload ${index + 1}`}
                                                className="w-full h-full object-cover border-2 border-border-strong rounded-input"
                                            />
                                            <Button
                                                type="button"
                                                onClick={() => {
                                                    const newImages = [
                                                        ...uploadedImages,
                                                    ];
                                                    newImages.splice(index, 1);
                                                    setUploadedImages(
                                                        newImages
                                                    );
                                                }}
                                                variant="remove"
                                                size={null}
                                            >
                                                <CloseIcon
                                                    className="w-4 h-4"
                                                    stroke="var(--text-primary)"
                                                />
                                            </Button>
                                        </>
                                    ) : (
                                        <label className="w-full h-full bg-input-background border-2 border-border-main hover:border-border-highlight hover:bg-input-background transition-colors flex items-center justify-center cursor-pointer rounded-input">
                                            <input
                                                id="image-upload"
                                                name="image-upload"
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file =
                                                        e.target.files?.[0];
                                                    if (file) {
                                                        const reader =
                                                            new FileReader();
                                                        reader.onloadend =
                                                            () => {
                                                                if (
                                                                    typeof reader.result ===
                                                                    "string"
                                                                ) {
                                                                    setUploadedImages(
                                                                        [
                                                                            ...uploadedImages,
                                                                            reader.result,
                                                                        ]
                                                                    );
                                                                }
                                                            };
                                                        reader.readAsDataURL(
                                                            file
                                                        );
                                                    }
                                                }}
                                            />
                                            <span className="font-headline text-2xl font-black text-text-on-color">
                                                +
                                            </span>
                                        </label>
                                    )}
                                </div>
                            );
                        })}
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
                        <div>
                            <label
                                htmlFor="remove-logo"
                                className="block font-headline text-text-body-main mb-2 uppercase text-xs tracking-wider font-black"
                            >
                                {PLAY_PAGE.logoLabel.text}
                            </label>
                            <label className="relative flex items-center justify-center h-[52px] bg-input-background hover:bg-input-background transition-colors cursor-pointer select-none group">
                                <input
                                    id="remove-logo"
                                    name="remove-logo"
                                    type="checkbox"
                                    checked={nologo}
                                    onChange={(e) =>
                                        setNologo(e.target.checked)
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
                    data-type={
                        isAudioModel ? "audio" : isImageModel ? "image" : "text"
                    }
                >
                    {isLoading
                        ? PLAY_PAGE.generatingText.text
                        : isAudioModel
                        ? "Generate Audio"
                        : isImageModel
                        ? PLAY_PAGE.generateImageButton.text
                        : PLAY_PAGE.generateTextButton.text}
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

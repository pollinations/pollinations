import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { CloseIcon } from "../../assets/CloseIcon";
import { useModelList } from "../../../hooks/useModelList";

import { TextGenerator } from "../TextGenerator";
import { PLAY_PAGE } from "../../../content";
import { API_KEY } from "../../../api.config";

interface PlayGeneratorProps {
    selectedModel: string;
    prompt: string;
    onPromptChange?: (prompt: string) => void;
}

/**
 * PlayGenerator Component
 * Main generation interface for the Play page
 * Handles prompt input, parameters, and generation
 * Model selection is managed by parent PlayPage
 */
export function PlayGenerator({ selectedModel, prompt }: PlayGeneratorProps) {
    const [result, setResult] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [uploadedImages, setUploadedImages] = useState<string[]>([]);

    // Fetch available models for type checking
    const { imageModels, textModels } = useModelList();

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

    const handleGenerate = async () => {
        setIsLoading(true);

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

                const blob = await response.blob();
                const imageURL = URL.createObjectURL(blob);
                setResult(imageURL);
                setIsLoading(false);
            } catch (error) {
                console.error("Image generation error:", error);
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

                const data = await response.json();
                const text =
                    data.choices?.[0]?.message?.content || "No response";
                setResult(text);
                setIsLoading(false);
            } catch (error) {
                console.error("Text generation error:", error);
                setResult("Error generating text");
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
                            <TextGenerator content={PLAY_PAGE.addImagesLabel} />
                        </label>
                        <span className="font-body text-[10px] text-text-caption">
                            <TextGenerator content={PLAY_PAGE.upToFourLabel} />
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
                                                    stroke="var(--t001)"
                                                />
                                            </Button>
                                        </>
                                    ) : (
                                        <label className="w-full h-full bg-input-background border-2 border-border-main hover:border-border-highlight hover:bg-input-background transition-colors flex items-center justify-center cursor-pointer rounded-input">
                                            <input
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
                            <label className="block font-headline text-text-body-main mb-2 uppercase text-xs tracking-wider font-black">
                                <TextGenerator content={PLAY_PAGE.widthLabel} />
                            </label>
                            <input
                                type="number"
                                value={width}
                                onChange={(e) =>
                                    setWidth(Number(e.target.value))
                                }
                                className="w-full p-3 bg-input-background text-text-body-main font-body focus:outline-none focus:bg-input-background hover:bg-input-background transition-colors rounded-input"
                            />
                        </div>
                        <div>
                            <label className="block font-headline text-text-body-main mb-2 uppercase text-xs tracking-wider font-black">
                                <TextGenerator
                                    content={PLAY_PAGE.heightLabel}
                                />
                            </label>
                            <input
                                type="number"
                                value={height}
                                onChange={(e) =>
                                    setHeight(Number(e.target.value))
                                }
                                className="w-full p-3 bg-input-background text-text-body-main font-body focus:outline-none focus:bg-input-background hover:bg-input-background transition-colors rounded-input"
                            />
                        </div>
                        <div>
                            <label className="block font-headline text-text-body-main mb-2 uppercase text-xs tracking-wider font-black">
                                <TextGenerator content={PLAY_PAGE.seedLabel} />
                            </label>
                            <input
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
                            <label className="block font-headline text-text-body-main mb-2 uppercase text-xs tracking-wider font-black">
                                <TextGenerator
                                    content={PLAY_PAGE.enhanceLabel}
                                />
                            </label>
                            <label className="relative flex items-center justify-center h-[52px] bg-input-background hover:bg-input-background transition-colors cursor-pointer select-none group">
                                <input
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
                            <label className="block font-headline text-text-body-main mb-2 uppercase text-xs tracking-wider font-black">
                                <TextGenerator content={PLAY_PAGE.logoLabel} />
                            </label>
                            <label className="relative flex items-center justify-center h-[52px] bg-input-background hover:bg-input-background transition-colors cursor-pointer select-none group">
                                <input
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
            <Button
                type="button"
                onClick={handleGenerate}
                disabled={!prompt || isLoading}
                variant="generate"
                size={null}
                data-type={
                    isAudioModel ? "audio" : isImageModel ? "image" : "text"
                }
                className="mb-6"
            >
                {isLoading ? (
                    <TextGenerator content={PLAY_PAGE.generatingText} />
                ) : isAudioModel ? (
                    "Generate Audio"
                ) : isImageModel ? (
                    <TextGenerator content={PLAY_PAGE.generateImageButton} />
                ) : (
                    <TextGenerator content={PLAY_PAGE.generateTextButton} />
                )}
            </Button>

            {/* Result Display */}
            {result && (
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

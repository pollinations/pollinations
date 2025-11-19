import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { XIcon } from "../../icons/XIcon";
import { useModelList } from "../../hooks/useModelList";
import { Colors } from "../../config/colors";
import { TextGenerator } from "../TextGenerator";
import { PLAY_PAGE } from "../../config/content";

const API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY;

/**
 * PlayGenerator Component
 * Main generation interface for the Play page
 * Handles model selection, prompt input, parameters, and generation
 */
export function PlayGenerator() {
    const [prompt, setPrompt] = useState("");
    const [model, setModel] = useState("flux");
    const [result, setResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [uploadedImages, setUploadedImages] = useState([]);

    // Fetch available models
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

    const isImageModel = imageModels.some((m) => m.id === model);
    
    // Check if current model has audio output
    const isAudioModel = [...imageModels, ...textModels].some(
        (m) => m.id === model && m.hasAudioOutput
    );

    // Check if current model supports image input modality
    const currentModelData = [...imageModels, ...textModels].find(
        (m) => m.id === model
    );
    const supportsImageInput = currentModelData?.hasImageInput || false;

    const handleGenerate = async () => {
        setIsLoading(true);

        if (isImageModel) {
            try {
                const params = new URLSearchParams({
                    model,
                    width,
                    height,
                    seed,
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
                            model,
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
            {/* Model Selector - Unified List with Color Indicators */}
            <div className="mb-6">
                <div className="flex items-center gap-4 mb-3">
                    <label className="font-headline text-offblack uppercase text-xs tracking-wider font-black">
                        <TextGenerator content={PLAY_PAGE.modelsLabel} />
                    </label>
                    <div className="flex items-center gap-3 text-[10px] font-headline uppercase tracking-wider font-black">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-rose border border-offblack" />
                            <span className="text-offblack/50">
                                <TextGenerator content={PLAY_PAGE.imageLabel} />
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-lime border border-offblack" />
                            <span className="text-offblack/50">
                                <TextGenerator content={PLAY_PAGE.textLabel} />
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-cyan border border-offblack" />
                            <span className="text-offblack/50">Audio</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {[
                        ...imageModels.map((m) => ({ ...m, type: "image" })),
                        ...textModels.map((m) => ({ ...m, type: "text" })),
                    ].map((m) => {
                        // Detect audio OUTPUT models using hasAudioOutput field
                        const hasAudioOutput = m.hasAudioOutput;
                        const isImage = m.type === "image";
                        const modelType = hasAudioOutput ? "audio" : (isImage ? "image" : "text");
                        const isActive = model === m.id;
                        
                        const colorClass = hasAudioOutput ? "bg-cyan" : (isImage ? "bg-rose" : "bg-lime");
                        
                        return (
                            <Button
                                key={m.id}
                                type="button"
                                onClick={() => setModel(m.id)}
                                variant="model"
                                size={null}
                                data-active={isActive}
                                data-type={modelType}
                            >
                                <div
                                    className={`absolute left-0 top-0 bottom-0 w-1 ${colorClass}`}
                                />
                                {m.name}
                            </Button>
                        );
                    })}
                </div>
            </div>

            {/* Prompt Input */}
            <div className="mb-6">
                <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                    <TextGenerator content={PLAY_PAGE.promptLabel} />
                </label>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                        isImageModel
                            ? PLAY_PAGE.imagePlaceholder.text
                            : PLAY_PAGE.textPlaceholder.text
                    }
                    className="w-full p-4 bg-offblack/5 text-offblack font-body resize-none focus:outline-none focus:bg-offblack/10 hover:bg-offblack/10 transition-colors"
                    rows={4}
                />
            </div>

            {/* Image Upload (only for models with image input modality) */}
            {supportsImageInput && (
                <div className="mb-6">
                    <div className="flex items-baseline gap-2 mb-2">
                        <label className="font-headline text-offblack uppercase text-xs tracking-wider font-black">
                            <TextGenerator content={PLAY_PAGE.addImagesLabel} />
                        </label>
                        <span className="font-body text-[10px] text-offblack/40">
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
                                                className="w-full h-full object-cover border-2 border-offblack"
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
                                                <XIcon
                                                    className="w-4 h-4"
                                                    stroke={Colors.offblack}
                                                />
                                            </Button>
                                        </>
                                    ) : (
                                        <label className="w-full h-full bg-offblack/5 border-2 border-offblack/30 hover:border-lime hover:bg-offblack/10 transition-colors flex items-center justify-center cursor-pointer">
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
                                                                setUploadedImages(
                                                                    [
                                                                        ...uploadedImages,
                                                                        reader.result,
                                                                    ]
                                                                );
                                                            };
                                                        reader.readAsDataURL(
                                                            file
                                                        );
                                                    }
                                                }}
                                            />
                                            <span className="font-headline text-2xl font-black text-offblack/30">
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
                            <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                                <TextGenerator content={PLAY_PAGE.widthLabel} />
                            </label>
                            <input
                                type="number"
                                value={width}
                                onChange={(e) =>
                                    setWidth(Number(e.target.value))
                                }
                                className="w-full p-3 bg-offblack/5 text-offblack font-body focus:outline-none focus:bg-offblack/10 hover:bg-offblack/10 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
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
                                className="w-full p-3 bg-offblack/5 text-offblack font-body focus:outline-none focus:bg-offblack/10 hover:bg-offblack/10 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                                <TextGenerator content={PLAY_PAGE.seedLabel} />
                            </label>
                            <input
                                type="number"
                                value={seed}
                                onChange={(e) =>
                                    setSeed(Number(e.target.value))
                                }
                                placeholder={PLAY_PAGE.seedPlaceholder.text}
                                className="w-full p-3 bg-offblack/5 text-offblack font-body focus:outline-none focus:bg-offblack/10 hover:bg-offblack/10 transition-colors placeholder:text-offblack/40"
                            />
                        </div>
                        <div>
                            <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                                <TextGenerator
                                    content={PLAY_PAGE.enhanceLabel}
                                />
                            </label>
                            <label className="relative flex items-center justify-center h-[52px] bg-offblack/5 hover:bg-offblack/10 transition-colors cursor-pointer select-none group">
                                <input
                                    type="checkbox"
                                    checked={enhance}
                                    onChange={(e) =>
                                        setEnhance(e.target.checked)
                                    }
                                    className="sr-only peer"
                                />
                                <div className="w-6 h-6 border-4 border-rose bg-offblack/5 peer-checked:bg-lime transition-colors group-hover:border-rose" />
                                <svg
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 text-offblack opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
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
                            <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                                <TextGenerator content={PLAY_PAGE.logoLabel} />
                            </label>
                            <label className="relative flex items-center justify-center h-[52px] bg-offblack/5 hover:bg-offblack/10 transition-colors cursor-pointer select-none group">
                                <input
                                    type="checkbox"
                                    checked={nologo}
                                    onChange={(e) =>
                                        setNologo(e.target.checked)
                                    }
                                    className="sr-only peer"
                                />
                                <div className="w-6 h-6 border-4 border-rose bg-offblack/5 peer-checked:bg-lime transition-colors group-hover:border-rose" />
                                <svg
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 text-offblack opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
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
                data-type={isAudioModel ? "audio" : (isImageModel ? "image" : "text")}
                className="mb-6 w-auto mx-auto"
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
                <div className={isImageModel ? "" : "bg-offblack/5 p-6"}>
                    {isImageModel ? (
                        <img
                            src={result}
                            alt="Generated"
                            className="w-full h-auto"
                            onLoad={() => setIsLoading(false)}
                        />
                    ) : (
                        <div className="font-body text-offblack whitespace-pre-wrap">
                            {result}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

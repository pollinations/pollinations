import { useEffect, useState } from "react";
import { API_BASE } from "../../../api.config";
import { PLAY_PAGE } from "../../../copy/content/play";
import type { Model } from "../../../hooks/useModelList";
import { usePageCopy } from "../../../hooks/usePageCopy";
import { Button } from "../ui/button";

interface PlayGeneratorProps {
    selectedModel: string;
    prompt: string;
    onPromptChange?: (prompt: string) => void;
    imageModels: Model[];
    textModels: Model[];
    audioModels: Model[];
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
        return data?.message || data?.error || PLAY_PAGE.somethingWentWrong;
    } catch {
        return `Error ${response.status}: ${response.statusText}`;
    }
};

export function PlayGenerator({
    selectedModel,
    prompt,
    imageModels,
    textModels,
    audioModels,
    apiKey,
}: PlayGeneratorProps) {
    // Get translated copy
    const { copy } = usePageCopy(PLAY_PAGE);

    const [result, setResult] = useState<string | null>(null);
    const [resultType, setResultType] = useState<
        "image" | "video" | "audio" | "text" | null
    >(null);
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

    // Get current model data once and derive all flags from it
    const currentModelData = [
        ...imageModels,
        ...textModels,
        ...audioModels,
    ].find((m) => m.id === selectedModel);
    const isAudioModel =
        currentModelData?.hasAudioOutput ||
        currentModelData?.type === "audio" ||
        false;
    const isVideoModel = currentModelData?.hasVideoOutput || false;
    const supportsImageInput = currentModelData?.hasImageInput || false;
    const availableVoices = currentModelData?.voices || [];

    // Voice selection for audio models
    const [selectedVoice, setSelectedVoice] = useState<string>(
        availableVoices[0] || "",
    );

    // Update selected voice when model changes
    useEffect(() => {
        if (
            availableVoices.length > 0 &&
            !availableVoices.includes(selectedVoice)
        ) {
            setSelectedVoice(availableVoices[0]);
        }
    }, [availableVoices, selectedVoice]);

    const addImageUrl = () => {
        if (imageUrlInput.trim() && imageUrls.length < 4) {
            setImageUrls([...imageUrls, imageUrlInput.trim()]);
            setImageUrlInput("");
        }
    };

    const handleGenerate = async () => {
        setIsLoading(true);
        setError(null);
        setResult(null);
        setResultType(null);

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
                setResultType(isVideoModel ? "video" : "image");
                setIsLoading(false);
            } catch (err) {
                console.error("Image generation error:", err);
                setError(
                    err instanceof Error
                        ? err.message
                        : copy.somethingWentWrong,
                );
                setResult(null);
                setIsLoading(false);
            }
        } else if (isAudioModel) {
            // Audio models use chat completions with modalities parameter
            try {
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
                            modalities: ["text", "audio"],
                            audio: {
                                voice: selectedVoice || "alloy",
                                format: "wav",
                            },
                            messages: [
                                {
                                    role: "user",
                                    content: prompt,
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
                const audioData = data.choices?.[0]?.message?.audio?.data;
                if (!audioData) {
                    setError(copy.noResponse);
                    setResult(null);
                    setIsLoading(false);
                    return;
                }

                // Decode base64 audio to blob URL
                const binaryString = atob(audioData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: "audio/wav" });
                const audioURL = URL.createObjectURL(blob);
                setResult(audioURL);
                setResultType("audio");
                setIsLoading(false);
            } catch (err) {
                console.error("Audio generation error:", err);
                setError(
                    err instanceof Error
                        ? err.message
                        : copy.somethingWentWrong,
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
                    data.choices?.[0]?.message?.content || copy.noResponse;
                setResult(text);
                setResultType("text");
                setIsLoading(false);
            } catch (err) {
                console.error("Text generation error:", err);
                setError(
                    err instanceof Error
                        ? err.message
                        : copy.somethingWentWrong,
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
                                <div key={url} className="relative">
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
                    {/* URL input — Enter or blur to add */}
                    <input
                        id="image-url"
                        name="image-url"
                        type="url"
                        value={imageUrlInput}
                        onChange={(e) => setImageUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                addImageUrl();
                            }
                        }}
                        onBlur={addImageUrl}
                        placeholder={copy.imageUrlPlaceholder}
                        className="w-full p-3 bg-input-background text-text-body-main font-body focus:outline-none focus:bg-input-background hover:bg-input-background transition-colors placeholder:text-text-caption rounded-input"
                        disabled={imageUrls.length >= 4}
                    />
                </div>
            )}

            {/* Image Parameters (only show for image models) */}
            {isImageModel && (
                <div className="mb-6">
                    {/* Responsive auto-fill grid: fills rows completely */}
                    <div
                        className="grid gap-3 items-end"
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
                                {copy.widthLabel}
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
                                {copy.heightLabel}
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
                            <div className="relative group/seed inline-block mb-2">
                                <label
                                    htmlFor="image-seed"
                                    className="block font-headline text-text-body-main uppercase text-xs tracking-wider font-black cursor-help"
                                >
                                    {copy.seedLabel}
                                </label>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-charcoal text-text-body-main text-xs rounded-input shadow-lg border border-border-main opacity-0 group-hover/seed:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    {copy.seedTooltip}
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
                                placeholder={copy.seedPlaceholder}
                                className="w-full p-3 bg-input-background text-text-body-main font-body focus:outline-none focus:bg-input-background hover:bg-input-background transition-colors placeholder:text-text-caption rounded-input"
                            />
                        </div>
                        <div>
                            <div className="relative group/enhance inline-block mb-2">
                                <label
                                    htmlFor="enhance-prompt"
                                    className="block font-headline text-text-body-main uppercase text-xs tracking-wider font-black cursor-help"
                                >
                                    {copy.enhanceLabel}
                                </label>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-charcoal text-text-body-main text-xs rounded-input shadow-lg border border-border-main opacity-0 group-hover/enhance:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    {copy.enhanceTooltip}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-charcoal" />
                                </div>
                            </div>
                            <label className="relative flex items-center justify-center p-3 bg-input-background hover:bg-input-background transition-colors cursor-pointer select-none group rounded-input">
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
                                    aria-hidden="true"
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

            {/* Voice Selector (only show for audio models with available voices) */}
            {availableVoices.length > 0 && (
                <div className="mb-6">
                    <div className="font-headline text-text-body-main uppercase text-xs tracking-wider font-black mb-3">
                        {copy.voiceLabel}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {availableVoices.map((voice) => (
                            <Button
                                key={voice}
                                type="button"
                                onClick={() => setSelectedVoice(voice)}
                                variant="model"
                                size={null}
                                data-active={selectedVoice === voice}
                                data-type="audio"
                                className="border-2 border-indicator-audio"
                            >
                                {voice}
                            </Button>
                        ))}
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
                        isVideoModel
                            ? "video"
                            : isAudioModel
                              ? "audio"
                              : isImageModel
                                ? "image"
                                : "text"
                    }
                >
                    {isLoading ? (
                        <span className="flex items-center gap-2">
                            <span className="flex gap-1">
                                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
                            </span>
                            {copy.generatingText}
                        </span>
                    ) : isVideoModel ? (
                        copy.generateVideoButton
                    ) : isAudioModel ? (
                        copy.generateAudioButton
                    ) : isImageModel ? (
                        copy.generateImageButton
                    ) : (
                        copy.generateTextButton
                    )}
                </Button>
                {!prompt && !isLoading && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-charcoal text-text-body-main text-xs rounded-input shadow-lg border border-border-main opacity-0 group-hover/generate:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        {copy.enterPromptFirst}
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
            {result && !error && resultType && (
                <div
                    className={
                        resultType === "text" ? "bg-input-background p-6" : ""
                    }
                >
                    {resultType === "image" && (
                        <img
                            src={result}
                            alt="Generated"
                            className="w-full h-auto"
                            onLoad={() => setIsLoading(false)}
                        />
                    )}
                    {resultType === "video" && (
                        <video
                            src={result}
                            controls
                            autoPlay
                            loop
                            muted
                            className="w-full h-auto"
                            onLoadedData={() => setIsLoading(false)}
                        >
                            <track kind="captions" />
                        </video>
                    )}
                    {resultType === "audio" && (
                        <audio
                            src={result}
                            controls
                            autoPlay
                            className="w-full"
                            onLoadedData={() => setIsLoading(false)}
                        >
                            <track kind="captions" />
                        </audio>
                    )}
                    {resultType === "text" && (
                        <div className="font-body text-text-body-main whitespace-pre-wrap">
                            {result}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

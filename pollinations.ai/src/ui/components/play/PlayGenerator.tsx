import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../../../api.config";
import { PLAY_PAGE } from "../../../copy/content/play";
import type { Model } from "../../../hooks/useModelList";
import { usePageCopy } from "../../../hooks/usePageCopy";
import { CopyIcon } from "../../assets/CopyIcon";
import { ExternalLinkIcon } from "../../assets/ExternalLinkIcon";
import { Button } from "../ui/button";
import { Divider } from "../ui/divider";
import { Body, Heading, Label } from "../ui/typography";

interface PlayGeneratorProps {
    selectedModel: string;
    prompt: string;
    imageModels: Model[];
    textModels: Model[];
    audioModels: Model[];
    apiKey: string;
}

/** Renders a color-coded GET API URL: base/{type}/{prompt}?params&key=YOUR_API_KEY */
function ColoredUrl({
    base,
    type,
    prompt,
    placeholder = "your-prompt-here",
    params,
}: {
    base: string;
    type: string;
    prompt: string;
    placeholder?: string;
    params: Record<string, string>;
}) {
    const encodedPrompt = encodeURIComponent(prompt || placeholder);
    return (
        <span className="font-mono text-sm break-all">
            <span className="text-text-caption">
                {base}/{type}/
            </span>
            <span className="text-text-brand font-bold">{encodedPrompt}</span>
            {Object.keys(params).length > 0 && (
                <>
                    <span className="text-text-caption">?</span>
                    {Object.entries(params).map(([k, v], i) => (
                        <span key={k}>
                            {i > 0 && (
                                <span className="text-text-caption">&</span>
                            )}
                            <span className="text-text-highlight">{k}</span>
                            <span className="text-text-caption">=</span>
                            <span className="text-text-body-main">{v}</span>
                        </span>
                    ))}
                    <span className="text-text-caption">&</span>
                    <span className="text-text-highlight">key</span>
                    <span className="text-text-caption">=</span>
                    <span className="text-text-brand font-bold">
                        YOUR_API_KEY
                    </span>
                </>
            )}
        </span>
    );
}

// Helper to extract error message from API response
const extractErrorMessage = async (response: Response): Promise<string> => {
    try {
        const data = await response.json();
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
    const { copy } = usePageCopy(PLAY_PAGE);

    const [result, setResult] = useState<string | null>(null);
    const [resultType, setResultType] = useState<
        "image" | "video" | "audio" | "text" | null
    >(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [urlCopied, setUrlCopied] = useState(false);
    const [agentPrompt, setAgentPrompt] = useState("");
    const [agentPromptCopied, setAgentPromptCopied] = useState(false);

    // Fetch agent prompt for copy button
    useEffect(() => {
        const controller = new AbortController();
        fetch(
            "https://raw.githubusercontent.com/pollinations/pollinations/production/APIDOCS.md",
            { signal: controller.signal },
        )
            .then((res) => res.text())
            .then(setAgentPrompt)
            .catch(() => {});
        return () => controller.abort();
    }, []);

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

    const [selectedVoice, setSelectedVoice] = useState<string>(
        availableVoices[0] || "",
    );

    useEffect(() => {
        if (
            availableVoices.length > 0 &&
            !availableVoices.includes(selectedVoice)
        ) {
            setSelectedVoice(availableVoices[0]);
        }
    }, [availableVoices, selectedVoice]);

    // Live API URL/body computation
    const imageParams = useMemo(
        () => ({
            model: selectedModel,
            width: width.toString(),
            height: height.toString(),
            seed: seed.toString(),
            enhance: enhance.toString(),
            ...(imageUrls.length > 0 ? { image: imageUrls.join("|") } : {}),
        }),
        [selectedModel, width, height, seed, enhance, imageUrls],
    );

    const textParams = useMemo(
        () => ({
            model: selectedModel,
            ...(imageUrls.length > 0 ? { image: imageUrls.join("|") } : {}),
        }),
        [selectedModel, imageUrls],
    );

    const audioParams = useMemo(
        () => ({
            model: selectedModel,
            ...(selectedVoice ? { voice: selectedVoice } : {}),
        }),
        [selectedModel, selectedVoice],
    );

    const copyableUrl = useMemo(() => {
        const encodedPrompt = encodeURIComponent(prompt || "your-prompt-here");
        if (isImageModel) {
            const qs = new URLSearchParams(imageParams).toString();
            return `${API_BASE}/image/${encodedPrompt}?${qs}&key=YOUR_API_KEY`;
        }
        if (isAudioModel) {
            const qs = new URLSearchParams(audioParams).toString();
            return `${API_BASE}/audio/${encodeURIComponent(prompt || "your-text-here")}?${qs}&key=YOUR_API_KEY`;
        }
        const qs = new URLSearchParams(textParams).toString();
        return `${API_BASE}/text/${encodedPrompt}?${qs}&key=YOUR_API_KEY`;
    }, [
        isImageModel,
        isAudioModel,
        imageParams,
        textParams,
        audioParams,
        prompt,
    ]);

    const addImageUrl = () => {
        if (imageUrlInput.trim() && imageUrls.length < 4) {
            setImageUrls([...imageUrls, imageUrlInput.trim()]);
            setImageUrlInput("");
        }
    };

    const handleGenerate = async () => {
        if (isLoading) return;
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
                if (imageUrls.length > 0) {
                    params.set("image", imageUrls.join("|"));
                }
                const url = `${API_BASE}/image/${encodeURIComponent(prompt)}?${params}`;
                const response = await fetch(url, {
                    headers: { Authorization: `Bearer ${apiKey}` },
                });
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
            try {
                const body = {
                    model: selectedModel,
                    modalities: ["text", "audio"],
                    audio: {
                        voice: selectedVoice || "alloy",
                        format: "wav",
                    },
                    messages: [{ role: "user", content: prompt }],
                };
                const response = await fetch(
                    `${API_BASE}/v1/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify(body),
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
                              { type: "text", text: prompt },
                              ...imageUrls.map((url: string) => ({
                                  type: "image_url",
                                  image_url: { url },
                              })),
                          ]
                        : prompt;
                const body = {
                    model: selectedModel,
                    messages: [{ role: "user", content }],
                };
                const response = await fetch(
                    `${API_BASE}/v1/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify(body),
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
            {/* Reference Images */}
            {supportsImageInput && (
                <div className="mb-6">
                    <div className="flex items-baseline gap-2 mb-2">
                        <Label as="span" spacing="none" display="inline">
                            {copy.referenceImagesLabel}
                        </Label>
                        <Body
                            as="span"
                            size="xs"
                            spacing="none"
                            className="text-text-caption"
                        >
                            {imageUrls.length}
                            {copy.referenceImagesCount}
                        </Body>
                    </div>
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
                                        className="absolute -top-1 -right-1 w-5 h-5 bg-surface-card border border-border-main rounded-full flex items-center justify-center text-text-body-main hover:bg-button-secondary-bg transition-colors"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
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

            {/* Image Parameters */}
            {isImageModel && (
                <div className="mb-6">
                    <div
                        className="grid gap-3 items-end"
                        style={{
                            gridTemplateColumns:
                                "repeat(auto-fit, minmax(120px, 1fr))",
                        }}
                    >
                        <div>
                            <Label>{copy.widthLabel}</Label>
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
                            <Label>{copy.heightLabel}</Label>
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
                                <Label
                                    as="span"
                                    spacing="none"
                                    display="inline"
                                    className="cursor-help"
                                >
                                    {copy.seedLabel}
                                </Label>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface-card text-text-body-main text-xs rounded-input shadow-lg border border-border-main opacity-0 group-hover/seed:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    {copy.seedTooltip}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-surface-card" />
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
                                <Label
                                    as="span"
                                    spacing="none"
                                    display="inline"
                                    className="cursor-help"
                                >
                                    {copy.enhanceLabel}
                                </Label>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface-card text-text-body-main text-xs rounded-input shadow-lg border border-border-main opacity-0 group-hover/enhance:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    {copy.enhanceTooltip}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-surface-card" />
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

            {/* Voice Selector */}
            {availableVoices.length > 0 && (
                <div className="mb-6">
                    <Label as="div" spacing="comfortable">
                        {copy.voiceLabel}
                    </Label>
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
                    disabled={!prompt && !isLoading}
                    variant="generate"
                    size={null}
                    className={
                        isLoading
                            ? "animate-pulse-subtle pointer-events-none cursor-wait"
                            : ""
                    }
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
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface-card text-text-body-main text-xs rounded-input shadow-lg border border-border-main opacity-0 group-hover/generate:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        {copy.enterPromptFirst}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-surface-card" />
                    </div>
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div className="mb-6 p-4 bg-surface-card border border-border-strong rounded-input">
                    <Body size="sm" spacing="none">
                        {error}
                    </Body>
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
                        <Body spacing="none" className="whitespace-pre-wrap">
                            {result}
                        </Body>
                    )}
                </div>
            )}

            {/* ── Integrate Section ── */}
            <Divider spacing="tight" />

            <Heading variant="section" spacing="default">
                {copy.integrateTitle}
            </Heading>

            <Body
                size="sm"
                spacing="default"
                className="text-text-body-secondary"
            >
                {copy.integrateIntro}
            </Body>

            {/* Live API URL */}
            <div className="mb-6">
                <div className="relative">
                    <div className="bg-input-background p-3 pr-16 rounded-input overflow-x-auto">
                        {isImageModel ? (
                            <ColoredUrl
                                base={API_BASE}
                                type="image"
                                prompt={prompt}
                                params={imageParams}
                            />
                        ) : isAudioModel ? (
                            <ColoredUrl
                                base={API_BASE}
                                type="audio"
                                prompt={prompt}
                                placeholder="your-text-here"
                                params={audioParams}
                            />
                        ) : (
                            <ColoredUrl
                                base={API_BASE}
                                type="text"
                                prompt={prompt}
                                params={textParams}
                            />
                        )}
                    </div>
                    <button
                        type="button"
                        className="absolute top-2 right-2 p-2.5 bg-surface-card hover:bg-button-secondary-bg rounded-input transition-colors"
                        onClick={() => {
                            navigator.clipboard.writeText(copyableUrl);
                            setUrlCopied(true);
                            setTimeout(() => setUrlCopied(false), 2000);
                        }}
                        title={copy.copyButton}
                    >
                        {urlCopied ? (
                            <span className="font-headline text-[10px] font-black text-text-brand uppercase tracking-wider px-1">
                                {copy.copiedLabel}
                            </span>
                        ) : (
                            <CopyIcon className="w-5 h-5 text-text-body-secondary" />
                        )}
                    </button>
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mb-6">
                <Button
                    as="a"
                    href="https://enter.pollinations.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="primary"
                    size="sm"
                >
                    {copy.getKeyButton}
                    <ExternalLinkIcon className="w-3 h-3" />
                </Button>
                <Button
                    as="a"
                    href="https://enter.pollinations.ai/api/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="secondary"
                    size="sm"
                >
                    {copy.fullApiDocsButton}
                    <ExternalLinkIcon className="w-3 h-3 text-text-body-main" />
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="relative"
                    onClick={() => {
                        navigator.clipboard.writeText(agentPrompt);
                        setAgentPromptCopied(true);
                        setTimeout(() => setAgentPromptCopied(false), 2000);
                    }}
                >
                    {copy.agentPromptButton}
                    <CopyIcon className="w-3 h-3" />
                    {agentPromptCopied && (
                        <span className="absolute -top-5 left-0 font-headline text-xs font-black text-text-brand uppercase tracking-wider">
                            {copy.copiedLabel}
                        </span>
                    )}
                </Button>
            </div>

            {/* Authentication */}
            <Heading
                variant="simple"
                as="h3"
                spacing="default"
                className="text-lg"
            >
                {copy.authTitle}
            </Heading>

            <Body
                size="sm"
                spacing="default"
                className="text-text-body-secondary"
            >
                {copy.authIntro}
            </Body>

            {/* Key type cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <div className="bg-surface-card p-4 rounded-sub-card">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-lg font-black text-text-highlight">
                            pk_
                        </span>
                        <Label as="span" spacing="none" display="inline">
                            {copy.publishableLabel}
                        </Label>
                    </div>
                    <ul className="list-none p-0 m-0 space-y-1">
                        <li>
                            <Body
                                as="span"
                                size="xs"
                                spacing="none"
                                className="text-text-body-secondary"
                            >
                                {copy.publishableFeature1}
                            </Body>
                        </li>
                        <li>
                            <Body
                                as="span"
                                size="xs"
                                spacing="none"
                                className="text-text-body-secondary"
                            >
                                {copy.publishableFeature2}
                            </Body>
                        </li>
                    </ul>
                    <div className="mt-3 border-l-2 border-yellow px-2 py-1">
                        <Body size="xs" spacing="none" className="text-yellow">
                            {copy.publishableBetaWarning}
                        </Body>
                    </div>
                </div>

                <div className="bg-surface-card p-4 rounded-sub-card">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-lg font-black text-text-brand">
                            sk_
                        </span>
                        <Label as="span" spacing="none" display="inline">
                            {copy.secretLabel}
                        </Label>
                    </div>
                    <ul className="list-none p-0 m-0 space-y-1">
                        <li>
                            <Body
                                as="span"
                                size="xs"
                                spacing="none"
                                className="text-text-body-secondary"
                            >
                                {copy.secretFeature1}
                            </Body>
                        </li>
                        <li>
                            <Body
                                as="span"
                                size="xs"
                                spacing="none"
                                className="text-text-body-secondary"
                            >
                                {copy.secretFeature2}
                            </Body>
                        </li>
                    </ul>
                    <div className="mt-3 border-l-2 border-pink px-2 py-1">
                        <Body size="xs" spacing="none" className="text-pink">
                            {copy.secretWarning}
                        </Body>
                    </div>
                </div>
            </div>

            {/* BYOP highlight */}
            <div className="flex items-start gap-3 bg-surface-card border-l-4 border-pink p-3 rounded-sub-card">
                <Label
                    as="span"
                    spacing="none"
                    display="inline"
                    className="text-pink whitespace-nowrap"
                >
                    {copy.byopLabel}
                </Label>
                <Body
                    as="span"
                    size="xs"
                    spacing="none"
                    className="text-text-body-secondary"
                >
                    {copy.byopDescription}{" "}
                    <a
                        href="https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-pink hover:underline"
                    >
                        {copy.byopButton} &rarr;
                    </a>
                </Body>
            </div>
        </>
    );
}

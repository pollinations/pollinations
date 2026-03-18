import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../../../api.config";
import { PLAY_PAGE, PLAY_PAGE_NO_TRANSLATE } from "../../../copy/content/play";
import { LINKS } from "../../../copy/content/socialLinks";
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
    placeholder,
    params,
    apiKeyPlaceholder,
    apiKeyParam,
}: {
    base: string;
    type: string;
    prompt: string;
    placeholder: string;
    params: Record<string, string>;
    apiKeyPlaceholder: string;
    apiKeyParam: string;
}) {
    const encodedPrompt = encodeURIComponent(prompt || placeholder);
    return (
        <span className="font-mono text-sm break-all">
            <span className="text-subtle">
                {base}/{type}/
            </span>
            <span className="text-dark font-bold">{encodedPrompt}</span>
            {Object.keys(params).length > 0 && (
                <>
                    <span className="text-subtle">?</span>
                    {Object.entries(params).map(([k, v], i) => (
                        <span key={k}>
                            {i > 0 && <span className="text-subtle">&</span>}
                            <span className="text-dark">{k}</span>
                            <span className="text-subtle">=</span>
                            <span className="text-dark">{v}</span>
                        </span>
                    ))}
                    <span className="text-subtle">&</span>
                    <span className="text-dark">{apiKeyParam}</span>
                    <span className="text-subtle">=</span>
                    <span className="text-dark font-bold">
                        {apiKeyPlaceholder}
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
    const { copy } = usePageCopy(PLAY_PAGE, PLAY_PAGE_NO_TRANSLATE);

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
        fetch(LINKS.apidocsRaw, { signal: controller.signal })
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
    const [isUploading, setIsUploading] = useState(false);

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
        const encodedPrompt = encodeURIComponent(
            prompt || copy.urlPlaceholderPrompt,
        );
        if (isImageModel) {
            const qs = new URLSearchParams(imageParams).toString();
            return `${API_BASE}/image/${encodedPrompt}?${qs}&${copy.urlApiKeyParam}=${copy.urlApiKeyPlaceholder}`;
        }
        if (isAudioModel) {
            const qs = new URLSearchParams(audioParams).toString();
            return `${API_BASE}/audio/${encodeURIComponent(prompt || copy.urlPlaceholderText)}?${qs}&${copy.urlApiKeyParam}=${copy.urlApiKeyPlaceholder}`;
        }
        const qs = new URLSearchParams(textParams).toString();
        return `${API_BASE}/text/${encodedPrompt}?${qs}&${copy.urlApiKeyParam}=${copy.urlApiKeyPlaceholder}`;
    }, [
        isImageModel,
        isAudioModel,
        imageParams,
        textParams,
        audioParams,
        prompt,
        copy,
    ]);

    const handleFileUpload = async (file: File) => {
        if (!file || imageUrls.length >= 4) return;
        if (file.size > 5 * 1024 * 1024) {
            setError(copy.uploadTooLarge);
            return;
        }
        setIsUploading(true);
        setError(null);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch("https://media.pollinations.ai/upload", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}` },
                body: form,
            });
            if (!res.ok) throw new Error("Upload failed");
            const { url } = await res.json();
            setImageUrls((prev) => [...prev, url]);
        } catch {
            setError(copy.uploadFailed);
        } finally {
            setIsUploading(false);
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
                            className="text-subtle"
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
                                        alt={`${copy.imageAltReferencePrefix} ${index + 1}`}
                                        className="w-16 h-16 object-cover rounded-input border-2 border-dark"
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
                                        className="absolute -top-1 -right-1 w-5 h-5 bg-tan border border-border rounded-full flex items-center justify-center text-dark hover:bg-white transition-colors"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <label
                        className={`flex items-center justify-center gap-2 w-full p-3 border-2 border-dashed border-border-subtle rounded-input font-body text-sm cursor-pointer transition-colors ${isUploading ? "bg-white/60 text-subtle" : "bg-white hover:bg-cream text-muted hover:text-dark"} ${imageUrls.length >= 4 ? "opacity-50 pointer-events-none" : ""}`}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const file = e.dataTransfer.files[0];
                            if (file) handleFileUpload(file);
                        }}
                    >
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={imageUrls.length >= 4 || isUploading}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(file);
                                e.target.value = "";
                            }}
                        />
                        {isUploading
                            ? copy.uploadingLabel
                            : copy.uploadImageLabel}
                    </label>
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
                                className="w-full p-3 bg-white text-dark font-body focus:outline-none focus:bg-white hover:bg-white transition-colors rounded-input"
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
                                className="w-full p-3 bg-white text-dark font-body focus:outline-none focus:bg-white hover:bg-white transition-colors rounded-input"
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
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-dark text-xs rounded-input shadow-lg border border-border opacity-0 group-hover/seed:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    {copy.seedTooltip}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-input-background" />
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
                                className="w-full p-3 bg-white text-dark font-body focus:outline-none focus:bg-white hover:bg-white transition-colors placeholder:text-subtle rounded-input"
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
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-dark text-xs rounded-input shadow-lg border border-border opacity-0 group-hover/enhance:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    {copy.enhanceTooltip}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-input-background" />
                                </div>
                            </div>
                            <label className="relative flex items-center justify-center p-3 bg-white hover:bg-white transition-colors cursor-pointer select-none group rounded-input">
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
                                <div className="w-6 h-6 border-4 border-dark bg-white peer-checked:bg-white transition-colors group-hover:border-dark rounded-input" />
                                <svg
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 text-dark opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
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
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-dark text-xs rounded-input shadow-lg border border-border opacity-0 group-hover/generate:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        {copy.enterPromptFirst}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-input-background" />
                    </div>
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div className="mb-6 p-4 bg-cream border border-dark rounded-input">
                    <Body size="sm" spacing="none">
                        {error}
                    </Body>
                </div>
            )}

            {/* Result Display */}
            {result && !error && resultType && (
                <div className={resultType === "text" ? "bg-white p-6" : ""}>
                    {resultType === "image" && (
                        <img
                            src={result}
                            alt={copy.imageAltGenerated}
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

            <Body size="sm" spacing="default" className="text-muted">
                {copy.integrateIntro}
            </Body>

            {/* Live API URL */}
            <div className="mb-6">
                <div className="relative">
                    <div className="bg-white p-3 pr-16 rounded-input overflow-x-auto">
                        {isImageModel ? (
                            <ColoredUrl
                                base={API_BASE}
                                type="image"
                                prompt={prompt}
                                placeholder={copy.urlPlaceholderPrompt}
                                params={imageParams}
                                apiKeyPlaceholder={copy.urlApiKeyPlaceholder}
                                apiKeyParam={copy.urlApiKeyParam}
                            />
                        ) : isAudioModel ? (
                            <ColoredUrl
                                base={API_BASE}
                                type="audio"
                                prompt={prompt}
                                placeholder={copy.urlPlaceholderText}
                                params={audioParams}
                                apiKeyPlaceholder={copy.urlApiKeyPlaceholder}
                                apiKeyParam={copy.urlApiKeyParam}
                            />
                        ) : (
                            <ColoredUrl
                                base={API_BASE}
                                type="text"
                                prompt={prompt}
                                placeholder={copy.urlPlaceholderPrompt}
                                params={textParams}
                                apiKeyPlaceholder={copy.urlApiKeyPlaceholder}
                                apiKeyParam={copy.urlApiKeyParam}
                            />
                        )}
                    </div>
                    <button
                        type="button"
                        className="absolute top-2 right-2 p-2.5 bg-white hover:bg-white rounded-input transition-colors border border-tan"
                        onClick={() => {
                            navigator.clipboard.writeText(copyableUrl);
                            setUrlCopied(true);
                            setTimeout(() => setUrlCopied(false), 2000);
                        }}
                        title={copy.copyButton}
                    >
                        {urlCopied ? (
                            <span className="font-body text-xs font-bold text-dark uppercase tracking-wider px-1">
                                {copy.copiedLabel}
                            </span>
                        ) : (
                            <CopyIcon className="w-5 h-5 text-muted" />
                        )}
                    </button>
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mb-6">
                <Button
                    as="a"
                    href={LINKS.enter}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="primary"
                    size="sm"
                    className="bg-[rgb(var(--primary-strong))] text-dark hover:bg-[rgb(var(--primary-strong)/0.8)] hover:text-dark"
                >
                    {copy.getKeyButton}
                    <ExternalLinkIcon className="w-3 h-3" />
                </Button>
                <Button
                    as="a"
                    href={LINKS.enterApiDocs}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="secondary"
                    size="sm"
                    className="bg-secondary-strong text-dark hover:bg-secondary-strong/80 hover:text-dark"
                >
                    {copy.fullApiDocsButton}
                    <ExternalLinkIcon className="w-3 h-3 text-dark" />
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="relative bg-secondary-strong text-dark hover:bg-secondary-strong/80 hover:text-dark"
                    onClick={() => {
                        navigator.clipboard.writeText(agentPrompt);
                        setAgentPromptCopied(true);
                        setTimeout(() => setAgentPromptCopied(false), 2000);
                    }}
                >
                    {copy.agentPromptButton}
                    <CopyIcon className="w-3 h-3" />
                    {agentPromptCopied && (
                        <span className="absolute -top-5 left-0 font-body text-xs font-bold text-dark uppercase tracking-wider">
                            {copy.copiedLabel}
                        </span>
                    )}
                </Button>
            </div>

            {/* Authentication */}
            <Heading
                variant="subsection"
                as="h3"
                spacing="default"
                className="text-lg"
            >
                {copy.authTitle}
            </Heading>

            <Body size="sm" spacing="default" className="text-muted">
                {copy.authIntro}
            </Body>

            {/* Key type cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <div className="bg-secondary-light p-4 rounded-sub-card">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-lg font-black text-dark">
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
                                className="text-dark font-bold"
                            >
                                {copy.publishableFeature1}
                            </Body>
                        </li>
                        <li>
                            <Body
                                as="span"
                                size="xs"
                                spacing="none"
                                className="text-dark font-bold"
                            >
                                {copy.publishableFeature2}
                            </Body>
                        </li>
                    </ul>
                    <div className="mt-3 px-2 py-1 bg-accent-strong/30 rounded-sm">
                        <Body
                            size="xs"
                            spacing="none"
                            className="text-dark font-bold"
                        >
                            {copy.publishableBetaWarning}
                        </Body>
                    </div>
                </div>

                <div className="bg-primary-light p-4 rounded-sub-card">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-lg font-black text-dark">
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
                                className="text-dark font-bold"
                            >
                                {copy.secretFeature1}
                            </Body>
                        </li>
                        <li>
                            <Body
                                as="span"
                                size="xs"
                                spacing="none"
                                className="text-dark font-bold"
                            >
                                {copy.secretFeature2}
                            </Body>
                        </li>
                    </ul>
                    <div className="mt-3 px-2 py-1 bg-accent-strong/30 rounded-sm">
                        <Body
                            size="xs"
                            spacing="none"
                            className="text-dark font-bold"
                        >
                            {copy.secretWarning}
                        </Body>
                    </div>
                </div>
            </div>

            {/* BYOP highlight */}
            <a
                href={LINKS.byopDocs}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-6 bg-tertiary-light border-2 border-dark border-r-4 border-b-4 rounded-sub-card hover:brightness-95 transition-colors"
            >
                <div className="flex items-center gap-4">
                    <span className="text-4xl">🔌</span>
                    <div className="flex-1 min-w-0">
                        <span className="font-headline text-sm font-black text-dark block">
                            {copy.byopLabel}
                        </span>
                        <span className="font-body text-base text-muted block mt-1">
                            {copy.byopDescription}
                        </span>
                    </div>
                    <span className="font-headline text-sm font-black text-dark shrink-0">
                        &rarr;
                    </span>
                </div>
            </a>
        </>
    );
}

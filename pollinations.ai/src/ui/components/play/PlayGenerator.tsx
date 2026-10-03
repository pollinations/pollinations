import {
    Alert,
    AudioIcon,
    Button,
    ClipboardIcon,
    ContentHeader,
    CopyButton,
    ExternalLinkButton,
    Eyebrow,
    FieldStack,
    ImageIcon,
    Input,
    LinkCard,
    LockIcon,
    RobotIcon,
    Surface,
    TabButton,
    Text,
    Tooltip,
    VideoIcon,
} from "@pollinations/ui";
import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../../../api.config";
import { PLAY_PAGE, PLAY_PAGE_NO_TRANSLATE } from "../../../copy/content/play";
import { LINKS } from "../../../copy/content/socialLinks";
import type { Model } from "../../../hooks/useModelList";
import { usePageCopy } from "../../../hooks/usePageCopy";

interface PlayGeneratorProps {
    selectedModel: string;
    prompt: string;
    currentModel: Model | undefined;
    apiKey: string | null;
    onLoginRequired: () => void;
}

const CATEGORY_ICON = {
    text: RobotIcon,
    image: ImageIcon,
    video: VideoIcon,
    audio: AudioIcon,
} as const;

/** Renders a highlighted GET API URL: base/{type}/{prompt}?params&key=YOUR_API_KEY */
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
        <span className="break-all font-mono text-sm text-theme-text-strong">
            <span className="text-theme-text-muted">
                {base}/{type}/
            </span>
            <span className="font-bold">{encodedPrompt}</span>
            {Object.keys(params).length > 0 && (
                <>
                    <span className="text-theme-text-muted">?</span>
                    {Object.entries(params).map(([k, v], i) => (
                        <span key={k}>
                            {i > 0 && (
                                <span className="text-theme-text-muted">&</span>
                            )}
                            <span>{k}</span>
                            <span className="text-theme-text-muted">=</span>
                            <span>{v}</span>
                        </span>
                    ))}
                    <span className="text-theme-text-muted">&</span>
                    <span>{apiKeyParam}</span>
                    <span className="text-theme-text-muted">=</span>
                    <span className="font-bold">{apiKeyPlaceholder}</span>
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
    currentModel,
    apiKey,
    onLoginRequired,
}: PlayGeneratorProps) {
    const { copy } = usePageCopy(PLAY_PAGE, PLAY_PAGE_NO_TRANSLATE);

    const [result, setResult] = useState<string | null>(null);
    const [resultType, setResultType] = useState<
        "image" | "video" | "audio" | "text" | null
    >(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [agentPrompt, setAgentPrompt] = useState("");

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
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    const currentModelData = currentModel;
    // Image-registry models (type "image") include video models (hasVideoOutput),
    // which are served by the same /image endpoint — keep them in this flag.
    const isImageModel = currentModelData?.type === "image";
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
        // Reset the voice when switching to a model whose voice list doesn't
        // include the current selection (e.g. ElevenLabs -> Qwen3-TTS, which
        // has no voices). Otherwise a stale voice leaks across providers and
        // the API rejects it with "voice not available for this model".
        if (availableVoices.length === 0) {
            if (selectedVoice) setSelectedVoice("");
        } else if (!availableVoices.includes(selectedVoice)) {
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
            ...(imageUrls.length > 0 ? { image: imageUrls.join("|") } : {}),
        }),
        [selectedModel, width, height, seed, imageUrls],
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

    // Shared fetch → error-check → success/catch flow for all generation types.
    // onSuccess handles the type-specific response parsing and result state.
    const runGeneration = async (
        fetchFn: () => Promise<Response>,
        onSuccess: (response: Response) => Promise<void>,
        label: string,
    ) => {
        try {
            const response = await fetchFn();
            if (!response.ok) {
                setError(await extractErrorMessage(response));
                setResult(null);
                setIsLoading(false);
                return;
            }
            await onSuccess(response);
        } catch (err) {
            console.error(label, err);
            setError(
                err instanceof Error ? err.message : copy.somethingWentWrong,
            );
            setResult(null);
            setIsLoading(false);
        }
    };

    const handleGenerate = async () => {
        if (isLoading || !currentModelData) return;
        if (!apiKey) {
            onLoginRequired();
            return;
        }
        setIsLoading(true);
        setError(null);
        setResult(null);
        setResultType(null);

        if (isImageModel) {
            await runGeneration(
                () => {
                    const params = new URLSearchParams(imageParams);
                    const url = `${API_BASE}/image/${encodeURIComponent(prompt)}?${params}`;
                    return fetch(url, {
                        headers: { Authorization: `Bearer ${apiKey}` },
                    });
                },
                async (response) => {
                    const blob = await response.blob();
                    const imageURL = URL.createObjectURL(blob);
                    setResult(imageURL);
                    setResultType(isVideoModel ? "video" : "image");
                    setIsLoading(false);
                },
                "Image generation error:",
            );
        } else if (isAudioModel) {
            // Dedicated audio models (type=audio, e.g. elevenmusic, elevenlabs)
            // use /v1/audio/speech; text models with audio output use /v1/chat/completions
            const isDedicatedAudioModel = currentModelData?.type === "audio";
            await runGeneration(
                () => {
                    if (isDedicatedAudioModel) {
                        const body = {
                            model: selectedModel,
                            input: prompt,
                            ...(selectedVoice ? { voice: selectedVoice } : {}),
                        };
                        return fetch(`${API_BASE}/v1/audio/speech`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${apiKey}`,
                            },
                            body: JSON.stringify(body),
                        });
                    }
                    const body = {
                        model: selectedModel,
                        modalities: ["text", "audio"],
                        audio: {
                            voice: selectedVoice || "alloy",
                            format: "wav",
                        },
                        messages: [{ role: "user", content: prompt }],
                    };
                    return fetch(`${API_BASE}/v1/chat/completions`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify(body),
                    });
                },
                async (response) => {
                    let audioURL: string;
                    if (isDedicatedAudioModel) {
                        const blob = await response.blob();
                        audioURL = URL.createObjectURL(blob);
                    } else {
                        const data = await response.json();
                        const audioData =
                            data.choices?.[0]?.message?.audio?.data;
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
                        audioURL = URL.createObjectURL(blob);
                    }

                    setResult(audioURL);
                    setResultType("audio");
                    setIsLoading(false);
                },
                "Audio generation error:",
            );
        } else {
            await runGeneration(
                () => {
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
                    return fetch(`${API_BASE}/v1/chat/completions`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify(body),
                    });
                },
                async (response) => {
                    const data = await response.json();
                    const content = data.choices?.[0]?.message?.content;
                    const text = Array.isArray(content)
                        ? content.find((part) => part.type === "text")?.text
                        : content;
                    setResult(text || copy.noResponse);
                    setResultType("text");
                    setIsLoading(false);
                },
                "Text generation error:",
            );
        }
    };

    const generateType = isVideoModel
        ? "video"
        : isAudioModel
          ? "audio"
          : isImageModel
            ? "image"
            : "text";
    const GenerateIcon = !apiKey ? LockIcon : CATEGORY_ICON[generateType];
    const generateLabel = isLoading
        ? copy.generatingText
        : !apiKey
          ? copy.loginToGenerateButton
          : isVideoModel
            ? copy.generateVideoButton
            : isAudioModel
              ? copy.generateAudioButton
              : isImageModel
                ? copy.generateImageButton
                : copy.generateTextButton;

    return (
        <>
            {/* Reference Images */}
            {supportsImageInput && (
                <FieldStack
                    label={copy.referenceImagesLabel}
                    action={
                        <Text as="span" size="xs" tone="muted">
                            {imageUrls.length}
                            {copy.referenceImagesCount}
                        </Text>
                    }
                >
                    {imageUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {imageUrls.map((url, index) => (
                                <div key={url} className="relative">
                                    <img
                                        src={url}
                                        alt={`${copy.imageAltReferencePrefix} ${index + 1}`}
                                        className="h-16 w-16 rounded-lg bg-theme-bg-subtle object-cover"
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
                                        className="-top-1.5 -right-1.5 absolute flex h-5 w-5 items-center justify-center rounded-full bg-surface-opaque text-theme-text-strong transition-colors hover:bg-theme-bg-subtle"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <label
                        className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-theme-border border-dashed bg-surface-white p-3 font-body text-sm transition-colors ${isUploading ? "text-theme-text-muted" : "text-theme-text-base hover:bg-theme-bg-subtle hover:text-theme-text-strong"} ${imageUrls.length >= 4 ? "pointer-events-none opacity-50" : ""}`}
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
                </FieldStack>
            )}

            {/* Image Parameters */}
            {isImageModel && (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] items-end gap-3">
                    <FieldStack label={copy.widthLabel}>
                        <Input
                            id="image-width"
                            name="image-width"
                            type="number"
                            value={width}
                            onChange={(e) => setWidth(Number(e.target.value))}
                        />
                    </FieldStack>
                    <FieldStack label={copy.heightLabel}>
                        <Input
                            id="image-height"
                            name="image-height"
                            type="number"
                            value={height}
                            onChange={(e) => setHeight(Number(e.target.value))}
                        />
                    </FieldStack>
                    <FieldStack
                        label={
                            <Tooltip
                                triggerAs="span"
                                content={copy.seedTooltip}
                            >
                                {copy.seedLabel}
                            </Tooltip>
                        }
                    >
                        <Input
                            id="image-seed"
                            name="image-seed"
                            type="number"
                            value={seed}
                            onChange={(e) => setSeed(Number(e.target.value))}
                            placeholder={copy.seedPlaceholder}
                        />
                    </FieldStack>
                </div>
            )}

            {/* Voice Selector */}
            {availableVoices.length > 0 && (
                <FieldStack label={copy.voiceLabel}>
                    <div className="flex flex-wrap gap-2">
                        {availableVoices.map((voice) => (
                            <TabButton
                                key={voice}
                                active={selectedVoice === voice}
                                size="sm"
                                onClick={() => setSelectedVoice(voice)}
                            >
                                {voice}
                            </TabButton>
                        ))}
                    </div>
                </FieldStack>
            )}

            {/* Generate Button */}
            {apiKey && !prompt && !isLoading ? (
                <Tooltip
                    triggerAs="span"
                    align="center"
                    content={copy.enterPromptFirst}
                    className="self-end"
                >
                    <Button size="lg" disabled>
                        <GenerateIcon className="mr-2 h-4 w-4" />
                        {generateLabel}
                    </Button>
                </Tooltip>
            ) : (
                <Button
                    size="lg"
                    disabled={isLoading || !currentModelData}
                    onClick={apiKey ? handleGenerate : onLoginRequired}
                    className="self-end"
                >
                    <GenerateIcon className="mr-2 h-4 w-4" />
                    {generateLabel}
                </Button>
            )}

            {/* Error Display */}
            {error && <Alert intent="danger">{error}</Alert>}

            {/* Result Display */}
            {result && !error && resultType && (
                <div className="rounded-xl bg-surface-white p-3 text-theme-text-strong">
                    {resultType === "image" && (
                        <img
                            src={result}
                            alt={copy.imageAltGenerated}
                            className="h-auto w-full rounded-lg"
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
                            className="h-auto w-full rounded-lg"
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
                            className="polli-playground-audio w-full"
                            onLoadedData={() => setIsLoading(false)}
                        >
                            <track kind="captions" />
                        </audio>
                    )}
                    {resultType === "text" && (
                        <Text
                            as="p"
                            size="sm"
                            className="m-0 whitespace-pre-wrap break-words p-1"
                        >
                            {result}
                        </Text>
                    )}
                </div>
            )}

            {/* ── Integrate Section ── */}
            <section className="mt-6 flex flex-col gap-5 sm:mt-12">
                <ContentHeader
                    eyebrow={null}
                    title={copy.integrateTitle}
                    subtitle={copy.integrateIntro}
                />

                {/* Live API URL */}
                <div className="relative overflow-x-auto rounded-xl bg-surface-white p-3 pr-16">
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
                    <CopyButton
                        value={copyableUrl}
                        tooltip={null}
                        title={copy.copyButton}
                        className="absolute top-2 right-2 flex min-h-9 min-w-9 items-center justify-center rounded-full px-2 text-theme-text-muted transition-colors hover:bg-theme-bg-subtle hover:text-theme-text-strong"
                    >
                        {(copied) =>
                            copied ? (
                                <span className="font-bold text-theme-text-strong text-xs">
                                    {copy.copiedLabel}
                                </span>
                            ) : (
                                <ClipboardIcon className="h-5 w-5" />
                            )
                        }
                    </CopyButton>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                    <ExternalLinkButton
                        href={LINKS.enterKeys}
                        size="md"
                        intent="brand"
                    >
                        {copy.getKeyButton}
                    </ExternalLinkButton>
                    <ExternalLinkButton
                        href={LINKS.enterApiDocs}
                        size="md"
                        intent="neutral"
                    >
                        {copy.fullApiDocsButton}
                    </ExternalLinkButton>
                    <CopyButton
                        value={agentPrompt}
                        tooltip={null}
                        variant="button"
                        intent="neutral"
                        className="gap-2"
                    >
                        {(copied) => (
                            <>
                                {copied
                                    ? copy.copiedLabel
                                    : copy.agentPromptButton}
                                <ClipboardIcon className="h-4 w-4" />
                            </>
                        )}
                    </CopyButton>
                </div>

                {/* Authentication */}
                <h3 className="font-body font-semibold text-theme-text-strong text-xl">
                    {copy.authTitle}
                </h3>

                <Text size="sm" tone="muted">
                    {copy.authIntro}
                </Text>

                {/* Key type cards */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(
                        [
                            {
                                prefix: "sk_",
                                label: copy.secretLabel,
                                features: [
                                    copy.secretFeature1,
                                    copy.secretFeature2,
                                ],
                                note: copy.secretWarning,
                            },
                            {
                                prefix: "pk_",
                                label: copy.appKeyLabel,
                                features: [
                                    copy.appKeyFeature1,
                                    copy.appKeyFeature2,
                                ],
                                note: copy.appKeyNote,
                            },
                        ] as const
                    ).map((key) => (
                        <Surface
                            key={key.prefix}
                            variant="card"
                            className="flex flex-col gap-3 p-5"
                        >
                            <div className="flex items-center gap-2">
                                <span className="font-bold font-mono text-lg text-theme-text-strong">
                                    {key.prefix}
                                </span>
                                <Eyebrow>{key.label}</Eyebrow>
                            </div>
                            <ul className="m-0 flex list-none flex-col gap-1 p-0">
                                {key.features.map((feature) => (
                                    <li key={feature}>
                                        <Text
                                            as="span"
                                            size="sm"
                                            tone="strong"
                                            weight="semibold"
                                        >
                                            {feature}
                                        </Text>
                                    </li>
                                ))}
                            </ul>
                            <Text
                                size="xs"
                                className="rounded-lg bg-theme-bg-subtle px-3 py-2"
                            >
                                {key.note}
                            </Text>
                        </Surface>
                    ))}
                </div>

                {/* BYOP highlight */}
                <LinkCard
                    href={LINKS.byopDocs}
                    surfaceClassName="flex-row items-center gap-4 rounded-2xl"
                >
                    <span aria-hidden="true" className="text-4xl">
                        🔌
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                        <span className="font-semibold text-base text-theme-text-strong">
                            {copy.byopLabel}
                        </span>
                        <Text as="span" size="sm" tone="muted">
                            {copy.byopDescription}
                        </Text>
                    </span>
                </LinkCard>
            </section>
        </>
    );
}

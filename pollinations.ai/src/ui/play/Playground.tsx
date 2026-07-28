import {
    fetchModelCatalog,
    type ModelCatalog,
    type ModelCatalogItem,
    type ModelCategory,
    Pollinations,
} from "@pollinations/sdk";
import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import {
    Alert,
    AudioIcon,
    ButtonGroup,
    cn,
    FieldStack,
    FileUpload,
    ImageIcon,
    Input,
    MediaPlaceholder,
    Surface,
    TabButton,
    Text,
    Textarea,
    Tooltip,
} from "@pollinations/ui";
import {
    categoryLabel,
    ModalityDot,
    ModalityTab,
    ModelSelector,
} from "@pollinations/ui/gen";
import { useEffect, useMemo, useState } from "react";
import { ActionButton, PixelLabel } from "../site/kit";

type ViteImportMeta = ImportMeta & {
    env?: {
        VITE_POLLINATIONS_API_BASE_URL?: string;
    };
};

const API_BASE_URL = (
    (import.meta as ViteImportMeta).env?.VITE_POLLINATIONS_API_BASE_URL ||
    "https://gen.pollinations.ai"
).replace(/\/$/, "");

const EMPTY_CATALOG: ModelCatalog = {
    models: [],
    allowedModelIds: new Set(),
};

const CATEGORY_ORDER: ModelCategory[] = ["image", "video", "text", "audio"];
const AUDIO_UPLOAD_ACCEPT = "audio/*,.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm";
const AUDIO_UPLOAD_MAX_SIZE_BYTES = 20 * 1024 * 1024;

type PlaygroundResult =
    | {
          type: "image" | "video" | "audio";
          url: string;
          contentType: string;
          /** The seeded example, not something this visitor generated. */
          demo?: boolean;
      }
    | {
          type: "text";
          text: string;
      };

/**
 * The playground opens on a worked example rather than an empty form: prompt,
 * model, size and seed all filled in, with the image that combination actually
 * produced already in the output panel.
 *
 * The image is a live gen.pollinations.ai URL, not a bundled file. That works
 * anonymously — and costs nothing — because the media cache is checked before
 * auth (gen.pollinations.ai/src/middleware/media-cache.ts), so a URL generated
 * once stays publicly readable. It is R2-backed on a 30-day lifecycle that
 * refreshes on access, and this page keeps it warm.
 *
 * IMPORTANT: every field below feeds the URL. Change the prompt, model, size
 * or seed and it becomes a cache MISS, which 401s anonymously — the example
 * would simply stop loading. Re-run scripts/warm-demo.mjs after any edit.
 */
const DEMO = {
    prompt: "a bee reading a paper map while sitting on a sunflower, golden hour, shallow depth of field",
    model: "nanobanana-2-lite",
    category: "image" as ModelCategory,
    width: 1024,
    height: 768,
    seed: 7,
};

function demoImageUrl(): string {
    return (
        `${API_BASE_URL}/image/${encodeURIComponent(DEMO.prompt)}` +
        `?model=${DEMO.model}&width=${DEMO.width}&height=${DEMO.height}` +
        `&nologo=true&seed=${DEMO.seed}`
    );
}

function usePlaygroundCatalog(apiKey: string | null) {
    const [catalog, setCatalog] = useState<ModelCatalog>(EMPTY_CATALOG);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);
        setError(null);

        fetchModelCatalog({
            apiKey,
            baseUrl: API_BASE_URL,
            signal: controller.signal,
        })
            .then((nextCatalog) => {
                setCatalog(nextCatalog);
                setIsLoading(false);
            })
            .catch((err) => {
                if (err instanceof DOMException && err.name === "AbortError") {
                    return;
                }
                setError(err instanceof Error ? err : new Error(String(err)));
                setCatalog(EMPTY_CATALOG);
                setIsLoading(false);
            });

        return () => controller.abort();
    }, [apiKey]);

    return { catalog, isLoading, error };
}

function promptPlaceholder(
    category: ModelCategory,
    isAudioTranscription = false,
): string {
    if (category === "image")
        return "A luminous greenhouse full of tiny AI tools";
    if (category === "video")
        return "A slow cinematic orbit around a glass workshop";
    if (category === "audio" && isAudioTranscription)
        return "Optional vocabulary, names, or context for the transcript";
    if (category === "audio")
        return "A calm voice introducing a new creative tool";
    return "Explain how to build a tiny AI app with Pollinations";
}

function getResultExtension(result: PlaygroundResult): string {
    if (result.type === "image") return "png";
    if (result.type === "video") return "mp4";
    if (result.type === "audio") return "mp3";
    return "txt";
}

function bytesToObjectUrl(buffer: ArrayBuffer, contentType: string): string {
    return URL.createObjectURL(new Blob([buffer], { type: contentType }));
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error || "Something went wrong");
}

function isAudioTranscriptionModel(
    model: ModelCatalogItem | undefined,
): boolean {
    return (
        model?.category === "audio" &&
        model.inputModalities.includes("audio") &&
        model.outputModalities.includes("text")
    );
}

function isTextToAudioModel(model: ModelCatalogItem | undefined): boolean {
    return (
        model?.category === "audio" &&
        model.inputModalities.includes("text") &&
        model.outputModalities.includes("audio")
    );
}

function referenceImageLimit(model: ModelCatalogItem | undefined): number {
    if (!model?.inputModalities.includes("image")) return 0;
    return model.maxReferenceImages ?? 0;
}

function pluralizeImages(count: number): string {
    return count === 1 ? "1 image" : `${count} images`;
}

function ModalityTabs({
    activeCategory,
    onCategoryChange,
}: {
    activeCategory: ModelCategory;
    onCategoryChange: (category: ModelCategory) => void;
}) {
    return (
        <ButtonGroup aria-label="Modality">
            {CATEGORY_ORDER.map((category) => (
                <ModalityTab
                    key={category}
                    active={activeCategory === category}
                    size="md"
                    // The modality choice is the playground's biggest decision,
                    // so its tabs outrank the default pill size.
                    className="px-6 py-2.5 text-lg"
                    onClick={() => onCategoryChange(category)}
                >
                    {categoryLabel(category)}
                </ModalityTab>
            ))}
        </ButtonGroup>
    );
}

function ResultPanel({
    result,
    isLoading,
    className,
}: {
    result: PlaygroundResult | null;
    isLoading: boolean;
    className?: string;
}) {
    return (
        <Surface
            variant="card"
            className={cn("flex min-h-[360px] flex-col gap-4 p-4", className)}
        >
            <div className="flex items-center justify-between gap-3 empty:hidden">
                {/* Say whose picture this is. The seeded example arrives before
                    the visitor has generated anything, and letting it pass as
                    their result would be a lie. */}
                {result?.type === "image" && result.demo && (
                    <Text as="span" size="xs" className="text-theme-text-muted">
                        Example output
                    </Text>
                )}
                {result && result.type !== "text" && !result.demo && (
                    <ActionButton
                        href={result.url}
                        download={`pollinations-playground.${getResultExtension(
                            result,
                        )}`}
                        tone="plain"
                        size="sm"
                        className="ml-auto"
                    >
                        Save
                    </ActionButton>
                )}
            </div>

            {isLoading ? (
                <MediaPlaceholder
                    label="Generating..."
                    detail="Hang tight while your result is created."
                    className="flex-1"
                />
            ) : !result ? (
                <MediaPlaceholder
                    icon={<ImageIcon className="h-5 w-5" />}
                    label="Output preview"
                    detail="Generated results appear here."
                    className="flex-1"
                />
            ) : result.type === "text" ? (
                <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-surface-white p-4 text-theme-text-strong">
                    <Text
                        as="p"
                        size="sm"
                        className="m-0 w-full whitespace-pre-wrap break-words leading-relaxed"
                    >
                        {result.text}
                    </Text>
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-surface-white p-3 text-theme-text-strong">
                    {result.type === "image" && (
                        <img
                            src={result.url}
                            alt="Generated"
                            className="max-h-full w-full rounded-lg object-contain"
                        />
                    )}

                    {result.type === "video" && (
                        <video
                            src={result.url}
                            controls
                            autoPlay
                            loop
                            muted
                            className="max-h-full w-full rounded-lg"
                        >
                            <track kind="captions" />
                        </video>
                    )}

                    {result.type === "audio" && (
                        <audio
                            src={result.url}
                            controls
                            autoPlay
                            className="w-full"
                        >
                            <track kind="captions" />
                        </audio>
                    )}
                </div>
            )}
        </Surface>
    );
}

async function uploadReferenceImages(
    client: Pollinations,
    files: File[],
): Promise<string[]> {
    const uploads = await Promise.all(
        files.map((file) =>
            client.upload(file, {
                name: file.name,
                contentType: file.type || undefined,
            }),
        ),
    );
    return uploads.map((upload) => upload.url);
}

export function Playground() {
    const { apiKey, isLoggedIn, isHydrated } = useAuthState();
    const { login } = useAuthActions();
    const {
        catalog,
        isLoading,
        error: catalogError,
    } = usePlaygroundCatalog(apiKey);
    const [activeCategory, setActiveCategory] = useState<ModelCategory>(
        DEMO.category,
    );
    const [selectedModel, setSelectedModel] = useState(DEMO.model);
    const [prompt, setPrompt] = useState(DEMO.prompt);
    const [width, setWidth] = useState(DEMO.width);
    const [height, setHeight] = useState(DEMO.height);
    const [seed, setSeed] = useState(DEMO.seed);
    const [referenceImages, setReferenceImages] = useState<File[]>([]);
    const [audioFiles, setAudioFiles] = useState<File[]>([]);
    const [selectedVoice, setSelectedVoice] = useState("");
    const [result, setResult] = useState<PlaygroundResult | null>({
        type: "image",
        url: demoImageUrl(),
        contentType: "image/jpeg",
        demo: true,
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Community models stay off the playground menu: this page pitches the
    // official catalog, and owner/model entries would double the list. Every
    // pick below goes through this so state never lands on a hidden model.
    const visibleModels = useMemo(
        () => catalog.models.filter((model) => !model.community),
        [catalog.models],
    );

    const currentModel = useMemo(
        () => visibleModels.find((model) => model.id === selectedModel),
        [visibleModels, selectedModel],
    );

    useEffect(() => {
        if (visibleModels.length === 0) return;
        if (visibleModels.some((model) => model.id === selectedModel)) return;
        const nextModel =
            visibleModels.find((model) => model.id === "flux") ??
            visibleModels.find((model) => model.category === "image") ??
            visibleModels[0];
        if (nextModel) {
            setSelectedModel(nextModel.id);
            setActiveCategory(nextModel.category);
        }
    }, [visibleModels, selectedModel]);

    useEffect(() => {
        if (!currentModel) return;
        const [firstVoice] = currentModel.voices;
        if (!firstVoice) {
            if (selectedVoice) setSelectedVoice("");
            return;
        }
        if (!currentModel.voices.includes(selectedVoice)) {
            setSelectedVoice(firstVoice);
        }
    }, [currentModel, selectedVoice]);

    useEffect(() => {
        return () => {
            // Only blob: URLs are ours to revoke — the seeded example is a
            // remote gen URL and revoking that is meaningless.
            if (result && result.type !== "text" && !result.demo) {
                URL.revokeObjectURL(result.url);
            }
        };
    }, [result]);

    const maxReferenceImages = referenceImageLimit(currentModel);
    const supportsReferenceImages = maxReferenceImages > 0;
    const isVideoReferenceMode =
        currentModel?.category === "video" && supportsReferenceImages;
    const isReferenceImageListMode =
        supportsReferenceImages && !isVideoReferenceMode;
    const supportsLastFrame =
        isVideoReferenceMode &&
        (currentModel?.videoCapabilities.includes("end_frame") ?? false) &&
        maxReferenceImages >= 2;
    const firstFrameFiles = referenceImages[0] ? [referenceImages[0]] : [];
    const lastFrameFiles = referenceImages[1] ? [referenceImages[1]] : [];
    const isAudioTranscription = isAudioTranscriptionModel(currentModel);
    const isTextToAudio = isTextToAudioModel(currentModel);
    const selectedModelAllowed =
        !!currentModel &&
        isLoggedIn &&
        catalog.allowedModelIds.has(currentModel.id);

    useEffect(() => {
        setReferenceImages((current) => {
            if (current.length <= maxReferenceImages) return current;
            return current.slice(0, maxReferenceImages);
        });
    }, [maxReferenceImages]);

    function selectCategory(category: ModelCategory) {
        setActiveCategory(category);
        if (currentModel?.category === category) return;

        const nextModel =
            visibleModels.find(
                (model) =>
                    model.category === category &&
                    (!isLoggedIn || catalog.allowedModelIds.has(model.id)),
            ) ?? visibleModels.find((model) => model.category === category);

        if (nextModel) setSelectedModel(nextModel.id);
    }

    function setFrameImage(index: 0 | 1, files: File[]) {
        setReferenceImages((current) => {
            const next: Array<File | undefined> = [current[0], current[1]];
            next[index] = files[0];
            if (index === 0 && !files[0]) next[1] = undefined;
            return next.filter((file): file is File => !!file);
        });
    }

    async function generate() {
        const trimmedPrompt = prompt.trim();
        const audioFile = audioFiles[0];

        if (!apiKey) {
            setError("Authorize the app before generating.");
            return;
        }
        if (!currentModel) {
            setError("Select a model first.");
            return;
        }
        if (!selectedModelAllowed) {
            setError("This key cannot use the selected model.");
            return;
        }
        if (isAudioTranscription && !audioFile) {
            setError("Upload an audio file first.");
            return;
        }
        if (!isAudioTranscription && !trimmedPrompt) {
            setError("Enter a prompt first.");
            return;
        }

        setIsGenerating(true);
        setError(null);
        setResult(null);

        try {
            const client = new Pollinations({
                apiKey,
                baseUrl: API_BASE_URL,
            });
            const referenceUrls = supportsReferenceImages
                ? await uploadReferenceImages(client, referenceImages)
                : [];

            if (
                currentModel.category === "image" ||
                currentModel.category === "video"
            ) {
                const response = await client.image(trimmedPrompt, {
                    model: currentModel.id,
                    width,
                    height,
                    seed,
                    referenceImage:
                        referenceUrls.length > 0 ? referenceUrls : undefined,
                });
                const contentType = response.contentType;
                const type =
                    currentModel.category === "video" ||
                    contentType.startsWith("video/")
                        ? "video"
                        : "image";
                setResult({
                    type,
                    url: bytesToObjectUrl(response.buffer, contentType),
                    contentType,
                });
                return;
            }

            if (currentModel.category === "audio") {
                if (isAudioTranscription && audioFile) {
                    const response = await client.transcribe(audioFile, {
                        model: currentModel.id,
                        prompt: trimmedPrompt || undefined,
                    });
                    setResult({
                        type: "text",
                        text: response.text || "No transcript",
                    });
                    return;
                }

                if (!isTextToAudio) {
                    setError(
                        "This audio model is not supported in the playground yet.",
                    );
                    return;
                }

                const response = await client.audio(trimmedPrompt, {
                    model: currentModel.id,
                    voice: selectedVoice || undefined,
                });
                setResult({
                    type: "audio",
                    url: bytesToObjectUrl(
                        response.buffer,
                        response.contentType,
                    ),
                    contentType: response.contentType,
                });
                return;
            }

            const content =
                referenceUrls.length > 0
                    ? [
                          { type: "text" as const, text: trimmedPrompt },
                          ...referenceUrls.map((url) => ({
                              type: "image_url" as const,
                              image_url: { url },
                          })),
                      ]
                    : trimmedPrompt;
            const response = await client.chat([{ role: "user", content }], {
                model: currentModel.id,
            });
            setResult({
                type: "text",
                text: response.choices[0]?.message.content || "No response",
            });
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setIsGenerating(false);
        }
    }

    const generateLabel =
        currentModel?.category === "video"
            ? "Generate video"
            : currentModel?.category === "audio"
              ? isAudioTranscription
                  ? "Transcribe audio"
                  : "Generate audio"
              : currentModel?.category === "text"
                ? "Generate text"
                : "Generate image";

    // Signed out is a step, not a fault — handled by the button itself.
    const needsConnect = isHydrated && !apiKey;
    const missingInput = isAudioTranscription
        ? audioFiles.length === 0
        : !prompt.trim();

    /** Why the button cannot fire, or null when it can. Drives the tooltip. */
    const blockedReason = needsConnect
        ? null
        : missingInput
          ? isAudioTranscription
              ? "Upload an audio file first"
              : "Write a prompt first"
          : !selectedModelAllowed
            ? "This key cannot use the selected model"
            : null;

    return (
        <div className="flex w-full flex-col gap-5 text-theme-text-base">
            {catalogError && (
                <Alert intent="danger">
                    Model catalog failed to load: {catalogError.message}
                </Alert>
            )}

            {/* Three lines, in the order you decide them: what kind of thing,
                then which model, then what that model is. Deliberately not a
                card — they read as a sequence, and a card would box them as
                one static panel. They sit above both columns because modality
                and model change the output, not just the prompt. */}
            <div className="flex flex-col items-start gap-3">
                <ModalityTabs
                    activeCategory={activeCategory}
                    onCategoryChange={selectCategory}
                />
                <ModelSelector
                    models={visibleModels}
                    category={activeCategory}
                    value={selectedModel}
                    isLoading={isLoading || !isHydrated}
                    // Same size as the modality tabs above — picking the model
                    // is the same rank of decision as picking the modality.
                    className="px-6 py-2.5 text-lg"
                    onChange={setSelectedModel}
                />
                {currentModel?.description && (
                    <p className="m-0 text-sm leading-relaxed text-theme-text-muted">
                        <PixelLabel variant="card" className="mr-2">
                            Tip
                        </PixelLabel>
                        {currentModel.description}
                    </p>
                )}
            </div>

            <div className="polli-playground-main-grid">
                <div className="flex flex-col gap-4">
                    <Surface
                        variant="card"
                        className="flex flex-1 flex-col gap-4 p-4"
                    >
                        <FieldStack label="Prompt">
                            <Textarea
                                value={prompt}
                                rows={7}
                                onChange={(event) =>
                                    setPrompt(event.target.value)
                                }
                                placeholder={promptPlaceholder(
                                    currentModel?.category ?? activeCategory,
                                    isAudioTranscription,
                                )}
                                className="polli-playground-textarea min-h-44"
                            />
                        </FieldStack>

                        {isAudioTranscription && (
                            <FieldStack label="Audio file">
                                <FileUpload
                                    value={audioFiles}
                                    onChange={setAudioFiles}
                                    maxFiles={1}
                                    maxSizeBytes={AUDIO_UPLOAD_MAX_SIZE_BYTES}
                                    accept={AUDIO_UPLOAD_ACCEPT}
                                    icon={<AudioIcon className="h-6 w-6" />}
                                    previewIcon={
                                        <AudioIcon className="h-5 w-5" />
                                    }
                                    label={
                                        <>
                                            Drag audio here or{" "}
                                            <span className="underline">
                                                browse
                                            </span>
                                        </>
                                    }
                                    onReject={(rejected) => {
                                        const reason = rejected[0]?.reason;
                                        if (reason === "size") {
                                            setError(
                                                "Audio files must be under 20 MB.",
                                            );
                                        } else if (reason === "count") {
                                            setError("Use one audio file.");
                                        } else if (reason === "type") {
                                            setError(
                                                "Use MP3, MP4, MPEG, MPGA, M4A, WAV, or WebM audio.",
                                            );
                                        }
                                    }}
                                />
                            </FieldStack>
                        )}

                        {isReferenceImageListMode && (
                            <FieldStack
                                label={
                                    <>
                                        Reference images (up to{" "}
                                        {pluralizeImages(maxReferenceImages)})
                                    </>
                                }
                            >
                                <FileUpload
                                    value={referenceImages}
                                    onChange={setReferenceImages}
                                    maxFiles={maxReferenceImages}
                                    maxSizeBytes={5 * 1024 * 1024}
                                    label={
                                        <>
                                            Drag up to{" "}
                                            {pluralizeImages(
                                                maxReferenceImages,
                                            )}{" "}
                                            here or{" "}
                                            <span className="underline">
                                                browse
                                            </span>
                                        </>
                                    }
                                    onReject={(rejected) => {
                                        const reason = rejected[0]?.reason;
                                        if (reason === "size") {
                                            setError(
                                                "Images must be under 5 MB each.",
                                            );
                                        } else if (reason === "count") {
                                            setError(
                                                `Use up to ${pluralizeImages(
                                                    maxReferenceImages,
                                                )}.`,
                                            );
                                        } else if (reason === "type") {
                                            setError(
                                                "Only image files are allowed.",
                                            );
                                        }
                                    }}
                                />
                            </FieldStack>
                        )}

                        {isVideoReferenceMode && (
                            <div className="polli-playground-frame-grid">
                                <FieldStack label="First frame">
                                    <FileUpload
                                        value={firstFrameFiles}
                                        onChange={(files) =>
                                            setFrameImage(0, files)
                                        }
                                        maxFiles={1}
                                        maxSizeBytes={5 * 1024 * 1024}
                                        label={
                                            <>
                                                Drag first frame here or{" "}
                                                <span className="underline">
                                                    browse
                                                </span>
                                            </>
                                        }
                                        onReject={(rejected) => {
                                            const reason = rejected[0]?.reason;
                                            if (reason === "size") {
                                                setError(
                                                    "Images must be under 5 MB each.",
                                                );
                                            } else if (reason === "count") {
                                                setError(
                                                    "Use one first frame.",
                                                );
                                            } else if (reason === "type") {
                                                setError(
                                                    "Only image files are allowed.",
                                                );
                                            }
                                        }}
                                    />
                                </FieldStack>

                                {supportsLastFrame && (
                                    <FieldStack label="Last frame">
                                        <FileUpload
                                            value={lastFrameFiles}
                                            onChange={(files) =>
                                                setFrameImage(1, files)
                                            }
                                            maxFiles={1}
                                            maxSizeBytes={5 * 1024 * 1024}
                                            disabled={
                                                firstFrameFiles.length === 0
                                            }
                                            label={
                                                firstFrameFiles.length === 0 ? (
                                                    "Add first frame before last frame"
                                                ) : (
                                                    <>
                                                        Drag last frame here or{" "}
                                                        <span className="underline">
                                                            browse
                                                        </span>
                                                    </>
                                                )
                                            }
                                            onReject={(rejected) => {
                                                const reason =
                                                    rejected[0]?.reason;
                                                if (reason === "size") {
                                                    setError(
                                                        "Images must be under 5 MB each.",
                                                    );
                                                } else if (reason === "count") {
                                                    setError(
                                                        "Use one last frame.",
                                                    );
                                                } else if (reason === "type") {
                                                    setError(
                                                        "Only image files are allowed.",
                                                    );
                                                }
                                            }}
                                        />
                                    </FieldStack>
                                )}
                            </div>
                        )}

                        {(currentModel?.category === "image" ||
                            currentModel?.category === "video") && (
                            <div className="polli-playground-settings-grid">
                                <FieldStack label="Width">
                                    <Input
                                        type="number"
                                        min={256}
                                        max={2048}
                                        step={64}
                                        value={width}
                                        onChange={(event) =>
                                            setWidth(Number(event.target.value))
                                        }
                                        hideNumberSteppers
                                    />
                                </FieldStack>
                                <FieldStack label="Height">
                                    <Input
                                        type="number"
                                        min={256}
                                        max={2048}
                                        step={64}
                                        value={height}
                                        onChange={(event) =>
                                            setHeight(
                                                Number(event.target.value),
                                            )
                                        }
                                        hideNumberSteppers
                                    />
                                </FieldStack>
                                <FieldStack label="Seed">
                                    <Input
                                        type="number"
                                        value={seed}
                                        onChange={(event) =>
                                            setSeed(Number(event.target.value))
                                        }
                                        hideNumberSteppers
                                    />
                                </FieldStack>
                            </div>
                        )}

                        {currentModel && currentModel.voices.length > 0 && (
                            <FieldStack
                                label={
                                    <>
                                        <ModalityDot modality="audio" />
                                        Voice
                                    </>
                                }
                                labelClassName="flex items-center gap-1.5"
                            >
                                <ButtonGroup aria-label="Voice">
                                    {currentModel.voices.map((voice) => (
                                        <TabButton
                                            key={voice}
                                            active={selectedVoice === voice}
                                            size="sm"
                                            onClick={() =>
                                                setSelectedVoice(voice)
                                            }
                                        >
                                            {voice}
                                        </TabButton>
                                    ))}
                                </ButtonGroup>
                            </FieldStack>
                        )}

                        {error && <Alert intent="danger">{error}</Alert>}

                        {/* Not connected is not a broken state, so the button
                            does not sit there disabled under a 🚫 cursor with
                            no explanation — it becomes the connect action. The
                            tooltip covers the cases that genuinely are blocked
                            (nothing typed, model not on this key). */}
                        {blockedReason ? (
                            <Tooltip
                                triggerAs="span"
                                align="center"
                                content={blockedReason}
                                className="w-full"
                            >
                                <ActionButton
                                    as="button"
                                    disabled
                                    className="w-full"
                                >
                                    {generateLabel}
                                </ActionButton>
                            </Tooltip>
                        ) : (
                            <ActionButton
                                as="button"
                                disabled={isGenerating}
                                // Wrapped: login() takes an optional request
                                // object, so passing the ref directly would
                                // hand it the click event.
                                onClick={
                                    needsConnect ? () => login() : generate
                                }
                                className="w-full"
                            >
                                {isGenerating
                                    ? "Generating..."
                                    : needsConnect
                                      ? "Connect to generate"
                                      : generateLabel}
                            </ActionButton>
                        )}
                    </Surface>
                </div>

                <ResultPanel
                    result={result}
                    isLoading={isGenerating}
                    className="polli-playground-output-panel"
                />
            </div>
        </div>
    );
}

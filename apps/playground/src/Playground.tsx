import {
    fetchModelCatalog,
    type ModelCatalog,
    type ModelCatalogItem,
    type ModelCategory,
    Pollinations,
} from "@pollinations/sdk/client";
import { useAuthState } from "@pollinations/sdk/react";
import {
    Alert,
    AudioIcon,
    Button,
    ButtonGroup,
    cn,
    Field,
    FileUpload,
    Heading,
    ImageIcon,
    Input,
    MediaPlaceholder,
    Surface,
    TabButton,
    Text,
    Textarea,
} from "@pollinations/ui";
import {
    categoryLabel,
    ModalityDot,
    ModelSelector,
} from "@pollinations/ui/gen";
import { useEffect, useMemo, useState } from "react";

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
      }
    | {
          type: "text";
          text: string;
      };

export type PlaygroundProps = {
    title?: string;
    subtitle?: string;
    className?: string;
};

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
                <TabButton
                    key={category}
                    active={activeCategory === category}
                    size="sm"
                    onClick={() => onCategoryChange(category)}
                >
                    <span className="polli:inline-flex polli:items-center polli:gap-1.5">
                        <ModalityDot modality={category} />
                        {categoryLabel(category)}
                    </span>
                </TabButton>
            ))}
        </ButtonGroup>
    );
}

function ResultPanel({
    result,
    isLoading,
    activeCategory,
    className,
}: {
    result: PlaygroundResult | null;
    isLoading: boolean;
    activeCategory: ModelCategory;
    className?: string;
}) {
    return (
        <Surface
            variant="panel"
            className={cn(
                "polli:flex polli:min-h-[360px] polli:flex-col polli:gap-4 polli:p-4",
                className,
            )}
        >
            <div className="polli:flex polli:items-center polli:justify-between polli:gap-3">
                <span className="polli:inline-flex polli:items-center polli:gap-1.5">
                    <ModalityDot modality={activeCategory} />
                    <Text as="h2" size="sm" tone="strong" weight="semibold">
                        Output
                    </Text>
                </span>
                {result && result.type !== "text" && (
                    <Button
                        as="a"
                        href={result.url}
                        download={`pollinations-playground.${getResultExtension(
                            result,
                        )}`}
                        size="sm"
                    >
                        Save
                    </Button>
                )}
            </div>

            {isLoading ? (
                <MediaPlaceholder
                    label="Generating..."
                    detail="Hang tight while your result is created."
                    className="polli:flex-1"
                />
            ) : !result ? (
                <MediaPlaceholder
                    icon={<ImageIcon className="polli:h-5 polli:w-5" />}
                    label="Output preview"
                    detail="Generated results appear here."
                    className="polli:flex-1"
                />
            ) : result.type === "text" ? (
                <div className="polli:min-h-0 polli:flex-1 polli:overflow-auto polli:rounded-xl polli:bg-surface-white polli:p-4 polli:text-theme-text-strong">
                    <Text
                        as="p"
                        size="sm"
                        className="polli:m-0 polli:w-full polli:whitespace-pre-wrap polli:break-words polli:leading-relaxed"
                    >
                        {result.text}
                    </Text>
                </div>
            ) : (
                <div className="polli:flex polli:min-h-0 polli:flex-1 polli:items-center polli:justify-center polli:overflow-hidden polli:rounded-xl polli:bg-surface-white polli:p-3 polli:text-theme-text-strong">
                    {result.type === "image" && (
                        <img
                            src={result.url}
                            alt="Generated"
                            className="polli:max-h-full polli:w-full polli:rounded-lg polli:object-contain"
                        />
                    )}

                    {result.type === "video" && (
                        <video
                            src={result.url}
                            controls
                            autoPlay
                            loop
                            muted
                            className="polli:max-h-full polli:w-full polli:rounded-lg"
                        >
                            <track kind="captions" />
                        </video>
                    )}

                    {result.type === "audio" && (
                        <audio
                            src={result.url}
                            controls
                            autoPlay
                            className="polli:w-full"
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

export function Playground({
    title = "Playground",
    subtitle = "Create and refine images, text, audio, and video from one focused workspace.",
    className,
}: PlaygroundProps) {
    const { apiKey, isLoggedIn, isHydrated } = useAuthState();
    const {
        catalog,
        isLoading,
        error: catalogError,
    } = usePlaygroundCatalog(apiKey);
    const [activeCategory, setActiveCategory] =
        useState<ModelCategory>("image");
    const [selectedModel, setSelectedModel] = useState("flux");
    const [prompt, setPrompt] = useState("");
    const [width, setWidth] = useState(1024);
    const [height, setHeight] = useState(1024);
    const [seed, setSeed] = useState(0);
    const [referenceImages, setReferenceImages] = useState<File[]>([]);
    const [audioFiles, setAudioFiles] = useState<File[]>([]);
    const [selectedVoice, setSelectedVoice] = useState("");
    const [result, setResult] = useState<PlaygroundResult | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const currentModel = useMemo(
        () => catalog.models.find((model) => model.id === selectedModel),
        [catalog.models, selectedModel],
    );

    useEffect(() => {
        if (catalog.models.length === 0) return;
        if (catalog.models.some((model) => model.id === selectedModel)) return;
        const nextModel =
            catalog.models.find((model) => model.id === "flux") ??
            catalog.models.find((model) => model.category === "image") ??
            catalog.models[0];
        if (nextModel) {
            setSelectedModel(nextModel.id);
            setActiveCategory(nextModel.category);
        }
    }, [catalog.models, selectedModel]);

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
            if (result && result.type !== "text") {
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
            catalog.models.find(
                (model) =>
                    model.category === category &&
                    (!isLoggedIn || catalog.allowedModelIds.has(model.id)),
            ) ?? catalog.models.find((model) => model.category === category);

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

    return (
        <div
            className={cn(
                "polli:flex polli:w-full polli:flex-col polli:gap-5 polli:text-theme-text-base",
                className,
            )}
        >
            <section className="polli:flex polli:flex-col polli:gap-1">
                {/* Neutral black, not theme-tinted: the package has no neutral
                    text token yet, so we use raw gray utilities here. Replace with
                    the shared neutral "ink" scale in the follow-up PR. */}
                <Heading
                    as="h1"
                    size="title"
                    className="polli-playground-title polli:m-0 polli:text-theme-text-strong"
                >
                    {title}
                </Heading>
                <p className="polli:m-0 polli:max-w-3xl polli:text-base polli:leading-relaxed polli:text-theme-text-base">
                    {subtitle}
                </p>
            </section>

            {catalogError && (
                <Alert intent="danger">
                    Model catalog failed to load: {catalogError.message}
                </Alert>
            )}

            <div className="polli-playground-main-grid">
                <div className="polli:flex polli:flex-col polli:gap-4">
                    <Surface
                        variant="panel"
                        className="polli:flex polli:flex-col polli:gap-4 polli:p-4"
                    >
                        <div className="polli-playground-control-bar">
                            <ModalityTabs
                                activeCategory={activeCategory}
                                onCategoryChange={selectCategory}
                            />
                            <ModelSelector
                                models={catalog.models}
                                category={activeCategory}
                                value={selectedModel}
                                isLoading={isLoading || !isHydrated}
                                onChange={setSelectedModel}
                            />
                        </div>
                    </Surface>

                    <Surface
                        variant="panel"
                        className="polli:flex polli:flex-col polli:gap-4 polli:p-4"
                    >
                        <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                            <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                                Prompt
                            </Field.Label>
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
                                className="polli-playground-textarea polli:min-h-44"
                            />
                        </Field.Root>

                        {isAudioTranscription && (
                            <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                                    Audio file
                                </Field.Label>
                                <FileUpload
                                    value={audioFiles}
                                    onChange={setAudioFiles}
                                    maxFiles={1}
                                    maxSizeBytes={AUDIO_UPLOAD_MAX_SIZE_BYTES}
                                    accept={AUDIO_UPLOAD_ACCEPT}
                                    icon={
                                        <AudioIcon className="polli:h-6 polli:w-6" />
                                    }
                                    previewIcon={
                                        <AudioIcon className="polli:h-5 polli:w-5" />
                                    }
                                    label={
                                        <>
                                            Drag audio here or{" "}
                                            <span className="polli:underline">
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
                            </Field.Root>
                        )}

                        {isReferenceImageListMode && (
                            <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                                    Reference images (up to{" "}
                                    {pluralizeImages(maxReferenceImages)})
                                </Field.Label>
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
                                            <span className="polli:underline">
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
                            </Field.Root>
                        )}

                        {isVideoReferenceMode && (
                            <div className="polli-playground-frame-grid">
                                <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                    <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                                        First frame
                                    </Field.Label>
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
                                                <span className="polli:underline">
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
                                </Field.Root>

                                {supportsLastFrame && (
                                    <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                        <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                                            Last frame
                                        </Field.Label>
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
                                                        <span className="polli:underline">
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
                                    </Field.Root>
                                )}
                            </div>
                        )}

                        {(currentModel?.category === "image" ||
                            currentModel?.category === "video") && (
                            <div className="polli-playground-settings-grid">
                                <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                    <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                                        Width
                                    </Field.Label>
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
                                </Field.Root>
                                <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                    <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                                        Height
                                    </Field.Label>
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
                                </Field.Root>
                                <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                    <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                                        Seed
                                    </Field.Label>
                                    <Input
                                        type="number"
                                        value={seed}
                                        onChange={(event) =>
                                            setSeed(Number(event.target.value))
                                        }
                                        hideNumberSteppers
                                    />
                                </Field.Root>
                            </div>
                        )}

                        {currentModel && currentModel.voices.length > 0 && (
                            <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                <Field.Label className="polli:flex polli:items-center polli:gap-1.5 polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                                    <ModalityDot modality="audio" />
                                    Voice
                                </Field.Label>
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
                            </Field.Root>
                        )}

                        {error && <Alert intent="danger">{error}</Alert>}

                        <Button
                            type="button"
                            size="lg"
                            disabled={
                                isGenerating ||
                                !apiKey ||
                                (isAudioTranscription
                                    ? audioFiles.length === 0
                                    : !prompt.trim()) ||
                                !selectedModelAllowed
                            }
                            onClick={generate}
                            className="polli:w-full polli:self-auto"
                        >
                            {isGenerating
                                ? "Generating..."
                                : currentModel?.category === "video"
                                  ? "Generate video"
                                  : currentModel?.category === "audio"
                                    ? isAudioTranscription
                                        ? "Transcribe audio"
                                        : "Generate audio"
                                    : currentModel?.category === "text"
                                      ? "Generate text"
                                      : "Generate image"}
                        </Button>
                    </Surface>
                </div>

                <ResultPanel
                    result={result}
                    isLoading={isGenerating}
                    activeCategory={currentModel?.category ?? activeCategory}
                    className="polli-playground-output-panel"
                />
            </div>
        </div>
    );
}

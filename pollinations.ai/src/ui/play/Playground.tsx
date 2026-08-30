import {
    fetchModelCatalog,
    type ModelCatalog,
    type ModelCategory,
    type ModelInfo,
    Pollinations,
} from "@pollinations/sdk";
import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import {
    Alert,
    AudioIcon,
    Button,
    ButtonGroup,
    CardIcon,
    ChevronIcon,
    cn,
    DownloadIcon,
    Dropdown,
    FieldStack,
    FileUpload,
    ImageIcon,
    Input,
    LockIcon,
    RobotIcon,
    ScrollArea,
    Slider,
    SproutIcon,
    Surface,
    TabButton,
    Text,
    Textarea,
    Tooltip,
    VideoIcon,
} from "@pollinations/ui";
import { categoryLabel } from "@pollinations/ui/gen";
import {
    type CSSProperties,
    type ReactNode,
    useEffect,
    useMemo,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { Chat } from "./Chat";

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

type PlaygroundModel = {
    id: string;
    title: string;
    description: string;
    category: ModelCategory;
    community: boolean;
    inputModalities: string[];
    outputModalities: string[];
    videoCapabilities: string[];
    resolutions: string[];
    minDuration?: number;
    maxDuration?: number;
    defaultDuration?: number;
    allowedDurations: number[];
    durationStep?: number;
    maxReferenceImages?: number;
    voices: string[];
    paidOnly: boolean;
};

const AUDIO_TASK_ORDER = [
    "transcription",
    "speech-generation",
    "music-and-sound-effects",
] as const;
type AudioTask = (typeof AUDIO_TASK_ORDER)[number];
const AUDIO_TASK_LABEL: Record<AudioTask, string> = {
    transcription: "Transcription",
    "speech-generation": "Speech generation",
    "music-and-sound-effects": "Music & sound effects",
};

function playgroundModel(model: ModelInfo): PlaygroundModel | null {
    const id = model.id ?? model.name;
    if (!id || !model.category) return null;

    return {
        id,
        title: model.title ?? model.name,
        description: model.description ?? "",
        category: model.category,
        community: model.community ?? false,
        inputModalities: model.input_modalities ?? [],
        outputModalities: model.output_modalities ?? [],
        videoCapabilities: model.video_capabilities ?? [],
        resolutions: model.resolutions ?? [],
        minDuration: model.min_duration,
        maxDuration: model.max_duration,
        defaultDuration: model.default_duration,
        allowedDurations: model.allowed_durations ?? [],
        durationStep: model.duration_step,
        maxReferenceImages: model.max_reference_images,
        voices: model.voices ?? [],
        paidOnly: model.paid_only ?? false,
    };
}

const CATEGORY_ORDER = [
    "text",
    "image",
    "video",
    "audio",
] as const satisfies readonly ModelCategory[];
type PlaygroundCategory = (typeof CATEGORY_ORDER)[number];
const CATEGORY_ICON = {
    text: RobotIcon,
    image: ImageIcon,
    video: VideoIcon,
    audio: AudioIcon,
} as const;
const UPLOAD_MEDIA_ORDER = ["image", "video", "audio"] as const;
type UploadMedia = (typeof UPLOAD_MEDIA_ORDER)[number];
const UPLOAD_ACCEPT: Record<UploadMedia, string> = {
    image: "image/*",
    video: "video/*,.mp4,.mov,.webm,.mkv",
    audio: "audio/*,.mp3,.mpeg,.mpga,.m4a,.wav",
};
const AUDIO_UPLOAD_MAX_SIZE_BYTES = 20 * 1024 * 1024;

const IMAGE_FORMATS = [
    { id: "square", label: "Square", ratio: "1:1", width: 1024, height: 1024 },
    {
        id: "portrait",
        label: "Portrait",
        ratio: "4:5",
        width: 1024,
        height: 1280,
    },
    {
        id: "landscape",
        label: "Landscape",
        ratio: "3:2",
        width: 1152,
        height: 768,
    },
    { id: "story", label: "Story", ratio: "9:16", width: 576, height: 1024 },
] as const;
type ImageFormat = (typeof IMAGE_FORMATS)[number]["id"] | "custom";

const VIDEO_FORMATS = [
    { id: "landscape", label: "Landscape", ratio: "16:9" },
    { id: "portrait", label: "Portrait", ratio: "9:16" },
] as const;
type VideoFormat = (typeof VIDEO_FORMATS)[number]["id"];

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
    category: PlaygroundCategory,
    audioTask?: AudioTask,
): string {
    if (category === "image") return "Describe the image you want…";
    if (category === "video") return "Describe the video you want…";
    if (audioTask === "transcription")
        return "Optional vocabulary, names, or context for the transcript";
    if (audioTask === "speech-generation")
        return "Enter the words you want spoken…";
    if (audioTask === "music-and-sound-effects")
        return "Describe the music or sound you want…";
    return "Describe what you want…";
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

function randomGenerationSeed(): number {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] & 0x7fffffff;
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error || "Something went wrong");
}

function isAudioTranscriptionModel(
    model: PlaygroundModel | undefined,
): boolean {
    return (
        model?.category === "audio" &&
        model.inputModalities.includes("audio") &&
        model.outputModalities.includes("text")
    );
}

function isTextToAudioModel(model: PlaygroundModel | undefined): boolean {
    return (
        model?.category === "audio" &&
        model.inputModalities.includes("text") &&
        model.outputModalities.includes("audio")
    );
}

function referenceImageLimit(model: PlaygroundModel | undefined): number {
    if (!model?.inputModalities.includes("image")) return 0;
    return model.maxReferenceImages ?? 0;
}

function pluralizeImages(count: number): string {
    return count === 1 ? "1 image" : `${count} images`;
}

function uploadMediaForModel(
    model: PlaygroundModel | undefined,
): UploadMedia[] {
    if (!model) return [];
    return model.inputModalities.filter((modality): modality is UploadMedia =>
        UPLOAD_MEDIA_ORDER.includes(modality as UploadMedia),
    );
}

function mediaList(modalities: UploadMedia[]): string {
    if (modalities.length < 2) return modalities[0] ?? "media";
    if (modalities.length === 2) return `${modalities[0]} or ${modalities[1]}`;
    return `${modalities.slice(0, -1).join(", ")}, or ${modalities[modalities.length - 1]}`;
}

function audioTaskForModel(model: PlaygroundModel): AudioTask {
    if (
        model.inputModalities.includes("audio") &&
        model.outputModalities.includes("text")
    )
        return "transcription";
    const audioPurpose = `${model.title} ${model.description}`.toLowerCase();
    if (
        audioPurpose.includes("music") ||
        audioPurpose.includes("sound effect") ||
        audioPurpose.includes("soundscape")
    )
        return "music-and-sound-effects";
    return "speech-generation";
}

/** Card = needs a paid balance; sprout = runs on any Pollen. */
function AccessIcon({ paidOnly }: { paidOnly?: boolean }) {
    return paidOnly ? (
        <CardIcon className="h-3.5 w-3.5 shrink-0" />
    ) : (
        <SproutIcon className="h-3.5 w-3.5 shrink-0" />
    );
}

/** Modality tabs only switch modes; model selection belongs to the media card. */
function modalityButtonStyle(active: boolean): CSSProperties {
    return {
        "--playground-mode-background": active
            ? "var(--polli-color-bg-active)"
            : "transparent",
        "--playground-mode-hover": "var(--polli-color-bg-hover)",
        "--playground-mode-hover-text": "var(--polli-color-text-hover)",
        color: active
            ? "var(--polli-color-text-strong)"
            : "var(--polli-color-text-soft)",
    } as CSSProperties;
}

function ModalityTabs({
    activeCategory,
    onSelectCategory,
}: {
    activeCategory: PlaygroundCategory;
    onSelectCategory: (category: PlaygroundCategory) => void;
}) {
    return (
        <fieldset
            aria-label="Modality"
            className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
        >
            {CATEGORY_ORDER.map((category) => {
                const active = category === activeCategory;
                const CategoryIcon = CATEGORY_ICON[category];
                return (
                    <TabButton
                        key={category}
                        active={active}
                        size="lg"
                        style={modalityButtonStyle(active)}
                        className="polli-playground-modality-button gap-2"
                        onClick={() => onSelectCategory(category)}
                    >
                        <CategoryIcon className="h-4 w-4 shrink-0" />
                        {category === "text"
                            ? "Agent"
                            : categoryLabel(category)}
                    </TabButton>
                );
            })}
        </fieldset>
    );
}

function AudioTaskPicker({
    value,
    onChange,
}: {
    value: AudioTask;
    onChange: (task: AudioTask) => void;
}) {
    return (
        <div className="flex min-w-0 items-center gap-3">
            <Text as="span" size="sm" weight="bold" className="shrink-0">
                Type
            </Text>
            <Dropdown
                className="w-max max-w-[calc(100vw-2rem)] p-2"
                trigger={(open) => (
                    <Button
                        type="button"
                        className="w-fit max-w-full self-start justify-between gap-2"
                        aria-label={`Audio type: ${AUDIO_TASK_LABEL[value]}`}
                    >
                        <span className="truncate">
                            {AUDIO_TASK_LABEL[value]}
                        </span>
                        <ChevronIcon expanded={open} />
                    </Button>
                )}
            >
                {(close) => (
                    <div className="flex flex-col gap-1">
                        {AUDIO_TASK_ORDER.map((task) => (
                            <TabButton
                                key={task}
                                active={task === value}
                                size="sm"
                                variant="ghost"
                                className="w-full justify-start text-left"
                                onClick={() => {
                                    onChange(task);
                                    close();
                                }}
                            >
                                {AUDIO_TASK_LABEL[task]}
                            </TabButton>
                        ))}
                    </div>
                )}
            </Dropdown>
        </div>
    );
}

function ModelPicker({
    models,
    selectedModel,
    isLoading,
    onSelectModel,
}: {
    models: PlaygroundModel[];
    selectedModel: string;
    isLoading: boolean;
    onSelectModel: (modelId: string) => void;
}) {
    const selected = models.find((model) => model.id === selectedModel);

    return (
        <div className="flex min-w-0 items-center gap-3">
            <Text as="span" size="sm" weight="bold" className="shrink-0">
                Model
            </Text>
            <Dropdown
                className="w-max max-w-[calc(100vw-2rem)] p-2"
                trigger={(open) => (
                    <Button
                        type="button"
                        disabled={isLoading || models.length === 0}
                        className="w-fit max-w-full self-start justify-between gap-2"
                        aria-label={`Model: ${selected?.title ?? "Unavailable"}`}
                    >
                        <span className="truncate">
                            {isLoading
                                ? "Loading models…"
                                : (selected?.title ?? "No models available")}
                        </span>
                        <ChevronIcon expanded={open} />
                    </Button>
                )}
            >
                {(close) => (
                    <ScrollArea className="max-h-80 pr-2">
                        <div className="flex flex-col gap-1">
                            {models.map((model) => (
                                <TabButton
                                    key={model.id}
                                    active={model.id === selectedModel}
                                    size="sm"
                                    variant="ghost"
                                    className="w-full justify-start text-left"
                                    onClick={() => {
                                        onSelectModel(model.id);
                                        close();
                                    }}
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span className="truncate">
                                            {model.title}
                                        </span>
                                        <AccessIcon paidOnly={model.paidOnly} />
                                    </span>
                                </TabButton>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </Dropdown>
        </div>
    );
}

/** Text has no URL to point a download at, so it becomes one on the spot. */
function downloadHref(result: PlaygroundResult): string {
    if (result.type === "text")
        return `data:text/plain;charset=utf-8,${encodeURIComponent(result.text)}`;
    return result.url;
}

function ResultDownloadButton({
    result,
    className,
}: {
    result: PlaygroundResult;
    className?: string;
}) {
    return (
        <Button
            as="a"
            href={downloadHref(result)}
            download={`pollinations-playground.${getResultExtension(result)}`}
            aria-label={`Download ${result.type}`}
            title={`Download ${result.type}`}
            size="sm"
            className={cn(
                "h-10 w-10 shrink-0 self-auto rounded-full p-0 shadow-sm",
                className,
            )}
        >
            <DownloadIcon className="h-4 w-4" />
        </Button>
    );
}

/**
 * The full-screen look at a picture or clip. Escape or the backdrop closes.
 *
 * Portalled to <body>: it renders from inside the output panel, whose
 * position:sticky always creates a stacking context — left in place, the
 * overlay can never paint above the site header no matter its z-index.
 */
function Lightbox({
    result,
    onClose,
}: {
    result: PlaygroundResult;
    onClose: () => void;
}) {
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [onClose]);

    if (result.type !== "image" && result.type !== "video") return null;

    return createPortal(
        // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes via the window listener above.
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged result — press Escape to close"
            className="fixed inset-0 z-[130] flex cursor-zoom-out items-center justify-center bg-brand-dark/85 p-6"
            onClick={onClose}
        >
            {result.type === "image" ? (
                <img
                    src={result.url}
                    alt="Generated, enlarged"
                    className="max-h-full max-w-full rounded-xl object-contain"
                />
            ) : (
                // The enlarged clip gets the controls the inline preview gave
                // up, and stopPropagation so using them doesn't close it.
                <video
                    src={result.url}
                    controls
                    autoPlay
                    loop
                    className="max-h-full max-w-full cursor-auto rounded-xl"
                    onClick={(event) => event.stopPropagation()}
                >
                    <track kind="captions" />
                </video>
            )}
        </div>,
        document.body,
    );
}

function ResultPanel({
    result,
    className,
}: {
    result: PlaygroundResult;
    className?: string;
}) {
    const [expanded, setExpanded] = useState(false);

    // A new result is a new picture — never inherit the previous zoom.
    // biome-ignore lint/correctness/useExhaustiveDependencies: runs off the result changing, not its value
    useEffect(() => setExpanded(false), [result]);

    const zoomButtonClass =
        "flex h-full w-full cursor-zoom-in items-center justify-center border-0 bg-transparent p-0";

    if (result.type === "audio") {
        return (
            <div
                className={cn(
                    "flex items-center gap-3 bg-surface-white p-4",
                    className,
                )}
            >
                {/* biome-ignore lint/a11y/useMediaCaption: Generated audio has no timed caption file; an empty track creates a broken native menu. */}
                <audio
                    src={result.url}
                    controls
                    controlsList="nodownload noplaybackrate"
                    autoPlay
                    className="polli-playground-audio min-w-0 flex-1"
                />
                <ResultDownloadButton result={result} />
            </div>
        );
    }

    return (
        <div className={cn("flex min-h-[360px] flex-col p-4", className)}>
            {result.type === "text" ? (
                <div className="relative min-h-0 flex-1 overflow-auto rounded-xl bg-surface-white p-4 pr-16 text-theme-text-strong">
                    <ResultDownloadButton
                        result={result}
                        className="absolute top-3 right-3"
                    />
                    <Text
                        as="p"
                        size="sm"
                        className="m-0 w-full whitespace-pre-wrap break-words leading-relaxed"
                    >
                        {result.text}
                    </Text>
                </div>
            ) : (
                <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-surface-white p-3 text-theme-text-strong">
                    <ResultDownloadButton
                        result={result}
                        className="absolute top-3 right-3 z-10"
                    />
                    {result.type === "image" && (
                        <button
                            type="button"
                            aria-label="Enlarge image"
                            className={zoomButtonClass}
                            onClick={() => setExpanded(true)}
                        >
                            <img
                                src={result.url}
                                alt="Generated"
                                className="max-h-full w-full rounded-lg object-contain"
                            />
                        </button>
                    )}

                    {result.type === "video" && (
                        // The inline preview drops its native controls so the
                        // whole frame is one click target for the lightbox —
                        // nesting controls inside a button would fight it.
                        // It already autoplays muted; the lightbox has the
                        // controls.
                        <button
                            type="button"
                            aria-label="Enlarge video"
                            className={zoomButtonClass}
                            onClick={() => setExpanded(true)}
                        >
                            <video
                                src={result.url}
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="pointer-events-none max-h-full w-full rounded-lg"
                            >
                                <track kind="captions" />
                            </video>
                        </button>
                    )}
                </div>
            )}

            {expanded && (
                <Lightbox result={result} onClose={() => setExpanded(false)} />
            )}
        </div>
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

export function Playground({ toolbarAction }: { toolbarAction?: ReactNode }) {
    const { apiKey, isLoggedIn, isHydrated } = useAuthState();
    const { login } = useAuthActions();
    const {
        catalog,
        isLoading,
        error: catalogError,
    } = usePlaygroundCatalog(apiKey);
    const [activeCategory, setActiveCategory] =
        useState<PlaygroundCategory>("text");
    const [audioTask, setAudioTask] = useState<AudioTask>("speech-generation");
    const [selectedModel, setSelectedModel] = useState("");
    const [prompt, setPrompt] = useState("");
    const [imageFormat, setImageFormat] = useState<ImageFormat>("square");
    const [videoFormat, setVideoFormat] = useState<VideoFormat>("landscape");
    const [width, setWidth] = useState(1024);
    const [height, setHeight] = useState(1024);
    const [selectedResolution, setSelectedResolution] = useState("");
    const [duration, setDuration] = useState(5);
    const [referenceImages, setReferenceImages] = useState<File[]>([]);
    const [audioFiles, setAudioFiles] = useState<File[]>([]);
    const [selectedVoice, setSelectedVoice] = useState("");
    const [result, setResult] = useState<PlaygroundResult | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Community models stay off the playground menu: this page pitches the
    // official catalog, and owner/model entries would double the list. Every
    // pick below goes through this so state never lands on a hidden model.
    const visibleModels = useMemo(
        () =>
            catalog.models
                .map(playgroundModel)
                .filter(
                    (model): model is PlaygroundModel =>
                        model !== null && !model.community,
                ),
        [catalog.models],
    );

    const currentModel = useMemo(
        () => visibleModels.find((model) => model.id === selectedModel),
        [visibleModels, selectedModel],
    );
    const categoryModels = useMemo(
        () =>
            visibleModels.filter(
                (model) =>
                    model.category === activeCategory &&
                    (activeCategory !== "audio" ||
                        audioTaskForModel(model) === audioTask),
            ),
        [activeCategory, audioTask, visibleModels],
    );

    useEffect(() => {
        if (activeCategory === "text") return;
        if (
            currentModel?.category === activeCategory &&
            (activeCategory !== "audio" ||
                audioTaskForModel(currentModel) === audioTask)
        )
            return;
        setSelectedModel(categoryModels[0]?.id ?? "");
        setAudioFiles([]);
    }, [activeCategory, audioTask, categoryModels, currentModel]);

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
        if (!currentModel) return;
        setSelectedResolution(currentModel.resolutions[0] ?? "");
        if (currentModel.category === "video") {
            setDuration(
                currentModel.defaultDuration ??
                    currentModel.allowedDurations[0] ??
                    currentModel.minDuration ??
                    5,
            );
        }
    }, [currentModel]);

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
    const uploadMedia =
        currentModel?.category === "audio"
            ? uploadMediaForModel(currentModel)
            : [];
    const acceptsMediaUpload = uploadMedia.length > 0;
    const requiresMediaUpload =
        currentModel?.category === "audio" &&
        acceptsMediaUpload &&
        !currentModel.inputModalities.includes("text");
    const mediaUploadAccept = uploadMedia
        .map((modality) => UPLOAD_ACCEPT[modality])
        .join(",");
    const mediaUploadLabel = mediaList(uploadMedia);
    const MediaUploadIcon = CATEGORY_ICON[uploadMedia[0] ?? "audio"];
    const showPromptInput =
        currentModel?.category !== "audio" ||
        isAudioTranscription ||
        currentModel.inputModalities.includes("text");
    const promptLabel =
        activeCategory === "image"
            ? "Image description"
            : activeCategory === "video"
              ? "Video description"
              : audioTask === "transcription"
                ? "Instructions (optional)"
                : audioTask === "speech-generation"
                  ? "Script"
                  : "Description";
    const selectedModelAllowed =
        !!currentModel &&
        isLoggedIn &&
        catalog.allowedModelIds.has(currentModel.id);
    const allowedDurations = currentModel?.allowedDurations ?? [];
    const minDuration = currentModel?.minDuration ?? duration;
    const maxDuration = currentModel?.maxDuration ?? duration;
    const fixedDuration = minDuration === maxDuration;
    const durationSliderValue =
        allowedDurations.length > 0
            ? Math.max(0, allowedDurations.indexOf(duration))
            : duration;
    const durationSliderMin = allowedDurations.length > 0 ? 0 : minDuration;
    const durationSliderMax =
        allowedDurations.length > 0 ? allowedDurations.length - 1 : maxDuration;
    const durationSliderStep =
        allowedDurations.length > 0 ? 1 : (currentModel?.durationStep ?? 1);
    const videoAspectRatio =
        VIDEO_FORMATS.find((format) => format.id === videoFormat)?.ratio ??
        "16:9";

    useEffect(() => {
        setReferenceImages((current) => {
            if (current.length <= maxReferenceImages) return current;
            return current.slice(0, maxReferenceImages);
        });
    }, [maxReferenceImages]);

    function selectCategory(category: PlaygroundCategory) {
        if (category === activeCategory) return;
        setActiveCategory(category);
        setAudioFiles([]);
        if (category === "text") return;
        const firstModel = visibleModels.find(
            (model) => model.category === category,
        );
        if (category === "audio" && firstModel)
            setAudioTask(audioTaskForModel(firstModel));
        setSelectedModel(firstModel?.id ?? "");
    }

    function selectAudioTask(task: AudioTask) {
        if (task === audioTask) return;
        setAudioTask(task);
        setSelectedModel(
            visibleModels.find(
                (model) =>
                    model.category === "audio" &&
                    audioTaskForModel(model) === task,
            )?.id ?? "",
        );
        setAudioFiles([]);
    }

    function selectModel(modelId: string) {
        setSelectedModel(modelId);
        setAudioFiles([]);
    }

    function selectImageFormat(format: ImageFormat) {
        setImageFormat(format);
        const preset = IMAGE_FORMATS.find((item) => item.id === format);
        if (!preset) return;
        setWidth(preset.width);
        setHeight(preset.height);
    }

    function selectDuration(value: number) {
        if (allowedDurations.length > 0) {
            setDuration(allowedDurations[value] ?? duration);
            return;
        }
        setDuration(value);
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
            setError("Connect before generating.");
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
            setError(`Add ${promptLabel.toLowerCase()} first.`);
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
            const requestSeed = randomGenerationSeed();
            const referenceUrls = supportsReferenceImages
                ? await uploadReferenceImages(client, referenceImages)
                : [];

            if (currentModel.category === "video") {
                const response = await client.video(trimmedPrompt, {
                    model: currentModel.id,
                    duration,
                    aspectRatio: videoAspectRatio,
                    resolution: selectedResolution || undefined,
                    seed: requestSeed,
                    referenceImage:
                        referenceUrls.length > 0 ? referenceUrls : undefined,
                });
                setResult({
                    type: "video",
                    url: bytesToObjectUrl(
                        response.buffer,
                        response.contentType,
                    ),
                    contentType: response.contentType,
                });
                return;
            }

            if (currentModel.category === "image") {
                const response = await client.image(trimmedPrompt, {
                    model: currentModel.id,
                    width,
                    height,
                    resolution: selectedResolution || undefined,
                    seed: requestSeed,
                    referenceImage:
                        referenceUrls.length > 0 ? referenceUrls : undefined,
                });
                setResult({
                    type: "image",
                    url: bytesToObjectUrl(
                        response.buffer,
                        response.contentType,
                    ),
                    contentType: response.contentType,
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
    const GenerateIcon = CATEGORY_ICON[activeCategory];
    const connectLabel =
        currentModel?.category === "video"
            ? "Connect to create video"
            : currentModel?.category === "audio"
              ? "Connect to create audio"
              : currentModel?.category === "text"
                ? "Connect to chat"
                : "Connect to generate image";

    // Signed out is a step, not a fault — handled by the button itself.
    const needsSignIn = isHydrated && !apiKey;
    const missingInput = requiresMediaUpload
        ? audioFiles.length === 0
        : !prompt.trim();

    /** Why the button cannot fire, or null when it can. Drives the tooltip. */
    const blockedReason = needsSignIn
        ? null
        : missingInput
          ? requiresMediaUpload
              ? `Upload ${mediaUploadLabel} first`
              : `Add ${promptLabel.toLowerCase()} first`
          : !selectedModelAllowed
            ? "This key cannot use the selected model"
            : null;

    const audioInput =
        currentModel?.category === "audio" && acceptsMediaUpload ? (
            <FieldStack
                label={`${mediaUploadLabel.charAt(0).toUpperCase()}${mediaUploadLabel.slice(1)} input`}
            >
                <FileUpload
                    value={audioFiles}
                    onChange={setAudioFiles}
                    variant="compact"
                    maxFiles={1}
                    maxSizeBytes={AUDIO_UPLOAD_MAX_SIZE_BYTES}
                    accept={mediaUploadAccept}
                    icon={<MediaUploadIcon className="h-6 w-6" />}
                    previewIcon={<MediaUploadIcon className="h-5 w-5" />}
                    label={
                        <>
                            Drag {mediaUploadLabel} here or{" "}
                            <span className="underline">browse</span>
                        </>
                    }
                    onReject={(rejected) => {
                        const reason = rejected[0]?.reason;
                        if (reason === "size") {
                            setError("Media files must be under 20 MB.");
                        } else if (reason === "count") {
                            setError("Use one media file.");
                        } else if (reason === "type") {
                            setError(
                                `Use ${mediaUploadLabel} files for this model.`,
                            );
                        }
                    }}
                />
            </FieldStack>
        ) : null;
    return (
        <div className="flex w-full flex-col gap-3 text-theme-text-base">
            {toolbarAction && (
                <div className="relative z-10 flex w-full justify-end">
                    {toolbarAction}
                </div>
            )}
            <Surface
                variant="panel"
                className="play-chat-shell flex flex-col overflow-hidden p-0"
            >
                <div className="flex w-full flex-col gap-3 bg-surface-opaque px-3 py-3 sm:px-4 sm:py-4">
                    <ModalityTabs
                        activeCategory={activeCategory}
                        onSelectCategory={selectCategory}
                    />
                </div>

                {activeCategory === "text" && <Chat />}

                {activeCategory !== "text" && (
                    <div className="polli-playground-main-grid">
                        {catalogError && (
                            <div className="px-4 pt-4">
                                <Alert intent="danger">
                                    Model catalog failed to load:{" "}
                                    {catalogError.message}
                                </Alert>
                            </div>
                        )}
                        <div className="polli-playground-input-panel flex flex-col gap-4 p-4">
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                                {activeCategory === "audio" && (
                                    <AudioTaskPicker
                                        value={audioTask}
                                        onChange={selectAudioTask}
                                    />
                                )}
                                <ModelPicker
                                    models={categoryModels}
                                    selectedModel={selectedModel}
                                    isLoading={isLoading || !isHydrated}
                                    onSelectModel={selectModel}
                                />
                            </div>
                            {isAudioTranscription && audioInput}
                            {showPromptInput && (
                                <FieldStack label={promptLabel}>
                                    <Textarea
                                        value={prompt}
                                        rows={isAudioTranscription ? 3 : 7}
                                        onChange={(event) =>
                                            setPrompt(event.target.value)
                                        }
                                        placeholder={promptPlaceholder(
                                            activeCategory,
                                            activeCategory === "audio"
                                                ? audioTask
                                                : undefined,
                                        )}
                                        className={cn(
                                            "polli-playground-textarea",
                                            isAudioTranscription
                                                ? "min-h-24"
                                                : "min-h-44",
                                        )}
                                    />
                                </FieldStack>
                            )}
                            {!isAudioTranscription && audioInput}

                            {isReferenceImageListMode && (
                                <FieldStack
                                    label={
                                        <>
                                            Reference images (up to{" "}
                                            {pluralizeImages(
                                                maxReferenceImages,
                                            )}
                                            )
                                        </>
                                    }
                                >
                                    <FileUpload
                                        value={referenceImages}
                                        onChange={setReferenceImages}
                                        variant="compact"
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
                                            variant="compact"
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
                                                const reason =
                                                    rejected[0]?.reason;
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
                                                variant="compact"
                                                maxFiles={1}
                                                maxSizeBytes={5 * 1024 * 1024}
                                                disabled={
                                                    firstFrameFiles.length === 0
                                                }
                                                label={
                                                    firstFrameFiles.length ===
                                                    0 ? (
                                                        "Add first frame before last frame"
                                                    ) : (
                                                        <>
                                                            Drag last frame here
                                                            or{" "}
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
                                                    } else if (
                                                        reason === "count"
                                                    ) {
                                                        setError(
                                                            "Use one last frame.",
                                                        );
                                                    } else if (
                                                        reason === "type"
                                                    ) {
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
                                <div
                                    className={cn(
                                        "gap-4",
                                        currentModel.category === "video"
                                            ? "grid md:grid-cols-2 xl:grid-cols-3"
                                            : "flex flex-col",
                                    )}
                                >
                                    <FieldStack label="Format">
                                        <ButtonGroup aria-label="Format">
                                            {currentModel.category === "image"
                                                ? IMAGE_FORMATS.map(
                                                      (format) => (
                                                          <TabButton
                                                              key={format.id}
                                                              active={
                                                                  imageFormat ===
                                                                  format.id
                                                              }
                                                              size="sm"
                                                              onClick={() =>
                                                                  selectImageFormat(
                                                                      format.id,
                                                                  )
                                                              }
                                                              className="gap-1.5"
                                                          >
                                                              <span>
                                                                  {format.label}
                                                              </span>
                                                              <span className="text-theme-text-muted text-xs">
                                                                  {format.ratio}
                                                              </span>
                                                          </TabButton>
                                                      ),
                                                  )
                                                : VIDEO_FORMATS.map(
                                                      (format) => (
                                                          <TabButton
                                                              key={format.id}
                                                              active={
                                                                  videoFormat ===
                                                                  format.id
                                                              }
                                                              size="sm"
                                                              onClick={() =>
                                                                  setVideoFormat(
                                                                      format.id,
                                                                  )
                                                              }
                                                              className="gap-1.5"
                                                          >
                                                              <span>
                                                                  {format.label}
                                                              </span>
                                                              <span className="text-theme-text-muted text-xs">
                                                                  {format.ratio}
                                                              </span>
                                                          </TabButton>
                                                      ),
                                                  )}
                                            {currentModel.category ===
                                                "image" && (
                                                <TabButton
                                                    active={
                                                        imageFormat === "custom"
                                                    }
                                                    size="sm"
                                                    onClick={() =>
                                                        selectImageFormat(
                                                            "custom",
                                                        )
                                                    }
                                                >
                                                    Custom
                                                </TabButton>
                                            )}
                                        </ButtonGroup>
                                    </FieldStack>

                                    {currentModel.category === "image" &&
                                        imageFormat === "custom" && (
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <FieldStack label="Width">
                                                    <Input
                                                        type="number"
                                                        min={256}
                                                        max={2048}
                                                        step={64}
                                                        value={width}
                                                        onChange={(event) =>
                                                            setWidth(
                                                                Number(
                                                                    event.target
                                                                        .value,
                                                                ),
                                                            )
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
                                                                Number(
                                                                    event.target
                                                                        .value,
                                                                ),
                                                            )
                                                        }
                                                        hideNumberSteppers
                                                    />
                                                </FieldStack>
                                            </div>
                                        )}

                                    {currentModel.resolutions.length > 1 && (
                                        <FieldStack label="Resolution">
                                            <ButtonGroup aria-label="Resolution">
                                                {currentModel.resolutions.map(
                                                    (resolution) => (
                                                        <TabButton
                                                            key={resolution}
                                                            active={
                                                                selectedResolution ===
                                                                resolution
                                                            }
                                                            size="sm"
                                                            onClick={() =>
                                                                setSelectedResolution(
                                                                    resolution,
                                                                )
                                                            }
                                                        >
                                                            {resolution.toUpperCase()}
                                                        </TabButton>
                                                    ),
                                                )}
                                            </ButtonGroup>
                                        </FieldStack>
                                    )}

                                    {currentModel.category === "video" && (
                                        <FieldStack
                                            label="Duration"
                                            action={
                                                <Text
                                                    as="span"
                                                    size="sm"
                                                    tone="strong"
                                                    weight="semibold"
                                                    className="tabular-nums"
                                                >
                                                    {duration}s
                                                </Text>
                                            }
                                        >
                                            {fixedDuration ? (
                                                <Text size="xs" tone="muted">
                                                    Fixed for this model
                                                </Text>
                                            ) : (
                                                <Slider
                                                    aria-label="Video duration"
                                                    aria-valuetext={`${duration} seconds`}
                                                    style={
                                                        {
                                                            "--polli-slider-fill":
                                                                "var(--polli-color-text-soft)",
                                                            "--polli-slider-track":
                                                                "var(--polli-color-bg-active)",
                                                        } as CSSProperties
                                                    }
                                                    min={durationSliderMin}
                                                    max={durationSliderMax}
                                                    step={durationSliderStep}
                                                    value={durationSliderValue}
                                                    onChange={(event) =>
                                                        selectDuration(
                                                            Number(
                                                                event.target
                                                                    .value,
                                                            ),
                                                        )
                                                    }
                                                />
                                            )}
                                        </FieldStack>
                                    )}
                                </div>
                            )}

                            {currentModel && currentModel.voices.length > 0 && (
                                <FieldStack label="Voice">
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
                                    disabled={isGenerating}
                                    // Wrapped: login() takes an optional request
                                    // object, so passing the ref directly would
                                    // hand it the click event.
                                    onClick={
                                        needsSignIn ? () => login() : generate
                                    }
                                    className="self-end"
                                >
                                    {needsSignIn ? (
                                        <LockIcon className="mr-2 h-4 w-4" />
                                    ) : (
                                        <GenerateIcon className="mr-2 h-4 w-4" />
                                    )}
                                    {isGenerating
                                        ? "Generating…"
                                        : needsSignIn
                                          ? connectLabel
                                          : generateLabel}
                                </Button>
                            )}
                        </div>

                        {result && <ResultPanel result={result} />}
                    </div>
                )}
            </Surface>
        </div>
    );
}

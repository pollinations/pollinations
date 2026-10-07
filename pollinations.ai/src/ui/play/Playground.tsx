import {
    type ModelCategory,
    type ModelInfo,
    Pollinations,
} from "@pollinations/sdk";
import {
    useAuthActions,
    useAuthState,
    useModelCatalog,
} from "@pollinations/sdk/react";
import {
    Alert,
    AudioIcon,
    Button,
    ButtonGroup,
    ChevronIcon,
    cn,
    Dialog,
    DownloadIcon,
    Dropdown,
    FieldStack,
    FileUpload,
    type FileUploadProps,
    ImageIcon,
    Input,
    LockIcon,
    MicIcon,
    ScrollArea,
    Slider,
    TabButton,
    Text,
    Textarea,
    Tooltip,
    VideoIcon,
    XIcon,
} from "@pollinations/ui";
import { categoryLabel } from "@pollinations/ui/gen";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
    type CSSProperties,
    Fragment,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { API_BASE_URL } from "../../config";
import { PLAY_SEARCH_KEYS, type PlaySearch } from "../../routes/-play-search";
import { ApiUrlCard } from "./ApiUrlCard";
import { MediaModelOption } from "./MediaModelOption";
import {
    type MediaModelMetadata,
    mediaModelSettings,
} from "./media-model-settings";
import {
    audioEndpoint,
    audioInputError,
    generatePlaygroundAudio,
} from "./playground-audio";
import { UploadPrivacyNote } from "./UploadPrivacyNote";
import { reproducibleApiUrl } from "./video-options";

/** A fixed setting shown as an icon and value instead of a control. */
function MediaFact({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <span
            role="img"
            aria-label={label}
            className="inline-flex items-center gap-1 text-xs tabular-nums text-theme-text-muted [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0"
        >
            {children}
        </span>
    );
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Something went wrong. Please try again.";
}

type PlaygroundModel = MediaModelMetadata & {
    id: string;
    aliases: string[];
    title: string;
    description: string;
    category: ModelCategory;
    inputModalities: string[];
    supportedEndpoints: string[];
    voices: string[];
    paidOnly: boolean;
    /** Requests in the last 24 hours, from the catalog health field. */
    requests: number;
};

// Groups the audio model list; the first group holds the default model.
const AUDIO_TASK_ORDER = [
    "speech-generation",
    "music-and-sound-effects",
    "audio-processing",
    "transcription",
] as const;
type AudioTask = (typeof AUDIO_TASK_ORDER)[number];
// Speech and music are distinguished by title/description; other tasks use endpoints.
const AUDIO_GROUP_LABEL: Record<AudioTask, string> = {
    "speech-generation": "Speech",
    "music-and-sound-effects": "Music & sound effects",
    "audio-processing": "Voice & cleanup",
    transcription: "Transcription",
};

/** `health` is a catalog field the SDK passes through untyped. */
function recentRequests(model: ModelInfo): number {
    const health = model.health as { requests?: unknown } | undefined;
    return typeof health?.requests === "number" ? health.requests : 0;
}

function playgroundModel(model: ModelInfo): PlaygroundModel | null {
    const id = model.id ?? model.name;
    if (!id || !model.category) return null;

    return {
        id,
        aliases: model.aliases ?? [],
        title: model.title ?? model.name,
        description: model.description ?? "",
        category: model.category,
        inputModalities: model.input_modalities ?? [],
        supportedEndpoints: model.supported_endpoints ?? [],
        videoCapabilities: model.video_capabilities ?? [],
        resolutions: model.resolutions ?? [],
        minDuration: model.min_duration,
        maxDuration: model.max_duration,
        defaultDuration: model.default_duration,
        allowedDurations: model.allowed_durations ?? [],
        durationStep: model.duration_step,
        maxReferenceImages: model.max_reference_images,
        voices: model.voices ?? [],
        // Gen treats a missing flag as not paid-only.
        paidOnly: model.paid_only ?? false,
        requests: recentRequests(model),
    };
}

const CATEGORY_ORDER = [
    "image",
    "video",
    "audio",
] as const satisfies readonly ModelCategory[];
type PlaygroundCategory = (typeof CATEGORY_ORDER)[number];
const CATEGORY_ICON = {
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
// Most video models take 16:9 or 9:16; the API rejects or adapts others.
// "" sends no ratio, so the model picks its default.
const VIDEO_ASPECT_RATIOS = ["", "16:9", "9:16"] as const;

const AUDIO_UPLOAD_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const IMAGE_UPLOAD_MAX_SIZE_BYTES = 5 * 1024 * 1024;

type PlaygroundResult =
    | {
          type: "image" | "video" | "audio";
          url: string;
          filename: string;
          requestUrl?: string;
      }
    | {
          type: "text";
          text: string;
      };

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

/** MIME subtypes that are not the usual file extension. */
const FILE_EXTENSIONS: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "audio/mpeg": "mp3",
    "audio/x-wav": "wav",
    "video/quicktime": "mov",
};

function mediaResult(
    type: "image" | "video" | "audio",
    {
        buffer,
        contentType,
        url,
    }: { buffer: ArrayBuffer; contentType: string; url?: string },
): PlaygroundResult {
    const mime = contentType.split(";")[0].trim();
    return {
        type,
        url: URL.createObjectURL(new Blob([buffer], { type: contentType })),
        requestUrl: url ? reproducibleApiUrl(url) : undefined,
        filename: `pollinations-playground.${FILE_EXTENSIONS[mime] ?? mime.split("/")[1]}`,
    };
}

function randomGenerationSeed(): number {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] & 0x7fffffff;
}

function referenceImageLimit(model: PlaygroundModel | undefined): number {
    if (!model?.inputModalities.includes("image")) return 0;
    return model.maxReferenceImages ?? 0;
}

function uploadMediaForModel(model: PlaygroundModel): UploadMedia[] {
    return model.inputModalities.filter((modality): modality is UploadMedia =>
        UPLOAD_MEDIA_ORDER.includes(modality as UploadMedia),
    );
}

function audioTaskForModel(model: PlaygroundModel): AudioTask {
    const endpoint = audioEndpoint(model);
    if (endpoint === "/v1/audio/transcriptions") return "transcription";
    if (
        endpoint === "/v1/audio/voice-changer" ||
        endpoint === "/v1/audio/voice-isolator"
    )
        return "audio-processing";
    const audioPurpose = `${model.title} ${model.description}`.toLowerCase();
    if (
        audioPurpose.includes("music") ||
        audioPurpose.includes("song") ||
        audioPurpose.includes("sound effect") ||
        audioPurpose.includes("soundscape")
    )
        return "music-and-sound-effects";
    return "speech-generation";
}

/**
 * One model list per tab, most requested first. Audio models are grouped by
 * what they do, then sorted within each group.
 */
function modelsInCategory(
    models: PlaygroundModel[],
    category: PlaygroundCategory,
): PlaygroundModel[] {
    const group = (model: PlaygroundModel) =>
        category === "audio"
            ? AUDIO_TASK_ORDER.indexOf(audioTaskForModel(model))
            : 0;
    return models
        .filter((model) => model.category === category)
        .sort((a, b) => group(a) - group(b) || b.requests - a.requests);
}

/** The catalog lists each tab's configured default model first. */
function defaultModelId(
    models: PlaygroundModel[],
    category: PlaygroundCategory,
): string {
    return models.find((model) => model.category === category)?.id ?? "";
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
                        className="gap-2"
                        onClick={() => onSelectCategory(category)}
                    >
                        <CategoryIcon className="h-4 w-4 shrink-0" />
                        {categoryLabel(category)}
                    </TabButton>
                );
            })}
        </fieldset>
    );
}

function VoicePicker({
    voices,
    value,
    onChange,
}: {
    voices: string[];
    value: string;
    onChange: (voice: string) => void;
}) {
    return (
        <FieldStack label="Voice" className="play-parameter-row min-w-0">
            <Dropdown
                portalled={false}
                className="w-80 max-w-[calc(100vw-2rem)] p-2"
                trigger={(open) => (
                    <Button
                        type="button"
                        className="w-fit max-w-full self-start justify-between gap-2"
                        aria-label={`Voice: ${value}`}
                    >
                        <span className="truncate">{value}</span>
                        <ChevronIcon expanded={open} />
                    </Button>
                )}
            >
                {(close) => (
                    <ScrollArea className="max-h-80 pr-2">
                        <div className="flex flex-col gap-1">
                            {voices.map((voice) => (
                                <TabButton
                                    key={voice}
                                    active={voice === value}
                                    size="sm"
                                    variant="ghost"
                                    className="w-full justify-start text-left"
                                    onClick={() => {
                                        onChange(voice);
                                        close();
                                    }}
                                >
                                    {voice}
                                </TabButton>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </Dropdown>
        </FieldStack>
    );
}

function ModelPicker({
    models,
    selectedModel,
    isLoading,
    onSelectModel,
    groupOf,
}: {
    models: PlaygroundModel[];
    selectedModel: string;
    isLoading: boolean;
    onSelectModel: (modelId: string) => void;
    /** Heading for a run of models; models arrive sorted by it. */
    groupOf?: (model: PlaygroundModel) => string;
}) {
    const selected = models.find((model) => model.id === selectedModel);

    return (
        <FieldStack label="Model" className="w-fit min-w-0 max-w-full">
            <Dropdown
                portalled={false}
                className="w-80 max-w-[calc(100vw-2rem)] p-2"
                trigger={(open) => (
                    <TabButton
                        active
                        size="lg"
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
                    </TabButton>
                )}
            >
                {(close) => (
                    <ScrollArea className="max-h-80 pr-2">
                        <div className="flex flex-col gap-1">
                            {models.map((model, index) => {
                                const group = groupOf?.(model);
                                const startsGroup =
                                    group &&
                                    (index === 0 ||
                                        group !== groupOf?.(models[index - 1]));
                                return (
                                    <Fragment key={model.id}>
                                        {startsGroup && (
                                            <Text
                                                as="h3"
                                                size="sm"
                                                weight="bold"
                                                tone="strong"
                                                className={cn(
                                                    "m-0 px-3 pt-2 pb-2 text-xs uppercase tracking-wider",
                                                    index > 0 &&
                                                        "mt-3 border-t border-theme-border pt-4",
                                                )}
                                            >
                                                {group}
                                            </Text>
                                        )}
                                        <TabButton
                                            active={model.id === selectedModel}
                                            size="sm"
                                            variant="ghost"
                                            className="w-full justify-start text-left"
                                            onClick={() => {
                                                onSelectModel(model.id);
                                                close();
                                            }}
                                        >
                                            <MediaModelOption model={model} />
                                        </TabButton>
                                    </Fragment>
                                );
                            })}
                        </div>
                    </ScrollArea>
                )}
            </Dropdown>
        </FieldStack>
    );
}

/** Results are local blob or data URLs, so a plain download link works. */
function ResultDownloadButton({
    result,
    className,
}: {
    result: PlaygroundResult;
    className?: string;
}) {
    const label = `Download ${result.type}`;
    return (
        <Button
            as="a"
            href={
                result.type === "text"
                    ? `data:text/plain;charset=utf-8,${encodeURIComponent(result.text)}`
                    : result.url
            }
            download={
                result.type === "text"
                    ? "pollinations-playground.txt"
                    : result.filename
            }
            size="sm"
            aria-label={label}
            title={label}
            className={cn(
                "h-10 w-10 shrink-0 self-auto rounded-full p-0",
                className,
            )}
        >
            <DownloadIcon className="size-4" />
        </Button>
    );
}

function Lightbox({
    result,
    open,
    onClose,
}: {
    result: PlaygroundResult;
    open: boolean;
    onClose: () => void;
}) {
    if (result.type !== "image" && result.type !== "video") return null;

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onClose();
            }}
            ariaLabel={`Enlarged ${result.type}`}
            size="xl"
            contentClassName="play-media-lightbox relative border-0 p-0"
        >
            <Button
                type="button"
                aria-label="Close media preview"
                onClick={onClose}
                className="absolute top-5 right-5 z-10 h-10 w-10 min-w-10 p-0 [&>svg]:size-5"
            >
                <XIcon />
            </Button>
            {open &&
                (result.type === "image" ? (
                    <img
                        src={result.url}
                        alt="Generated, enlarged"
                        className="block max-h-[calc(100dvh-5rem)] w-auto max-w-full self-center rounded-lg object-contain"
                    />
                ) : (
                    <video
                        src={result.url}
                        controls
                        autoPlay
                        loop
                        playsInline
                        className="block max-h-[calc(100dvh-5rem)] w-auto max-w-full self-center rounded-lg"
                    >
                        <track kind="captions" />
                    </video>
                ))}
        </Dialog>
    );
}

function ResultPanel({ result }: { result: PlaygroundResult }) {
    const [expanded, setExpanded] = useState(false);

    const zoomButtonClass =
        "block w-full cursor-zoom-in border-0 bg-transparent p-0";

    if (result.type === "audio") {
        return (
            <div className="flex items-center gap-3 bg-surface-white p-4">
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
        <div className="w-full min-w-0">
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
                <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-card bg-surface-white text-theme-text-strong">
                    <ResultDownloadButton
                        result={result}
                        className="absolute bottom-3 right-3 z-10"
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
                                className="block h-auto max-h-[min(70dvh,640px)] w-auto max-w-full"
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
                                className="pointer-events-none block h-auto max-h-[min(70dvh,640px)] w-auto max-w-full"
                            >
                                <track kind="captions" />
                            </video>
                        </button>
                    )}
                </div>
            )}

            <Lightbox
                result={result}
                open={expanded}
                onClose={() => setExpanded(false)}
            />
        </div>
    );
}

async function uploadReferenceImages(
    client: Pollinations,
    files: File[],
): Promise<string[]> {
    const uploads = await Promise.all(
        files.map((file) => client.upload(file, { name: file.name })),
    );
    return uploads.map((upload) => upload.url);
}

export function Playground() {
    const { apiKey, isLoggedIn, isHydrated } = useAuthState();
    const { login } = useAuthActions();
    const catalog = useModelCatalog({
        baseUrl: API_BASE_URL,
        enabled: isHydrated,
    });
    const { isLoading, error: catalogError } = catalog;
    const search = useSearch({ from: "/play" });
    const navigate = useNavigate({ from: "/play" });
    const [activeCategory, setActiveCategory] = useState<PlaygroundCategory>(
        CATEGORY_ORDER.find((value) => value === search.tab) ?? "image",
    );
    const [selectedModel, setSelectedModel] = useState(search.model ?? "");
    const [prompt, setPrompt] = useState(search.prompt ?? "");
    const [selectedResolution, setSelectedResolution] = useState(
        search.size ?? "",
    );
    const [width, setWidth] = useState(search.width ?? "");
    const [height, setHeight] = useState(search.height ?? "");
    const [duration, setDuration] = useState(Number(search.duration) || 0);
    const [aspectRatio, setAspectRatio] = useState(search.aspect ?? "");
    // Audio models declare no length range, so the API validates the value.
    const [audioLength, setAudioLength] = useState(search.length ?? "");
    const [language, setLanguage] = useState(search.language ?? "");
    const [seed, setSeed] = useState(search.seed ?? "");
    const [referenceImages, setReferenceImages] = useState<File[]>([]);
    const [audioFiles, setAudioFiles] = useState<File[]>([]);
    const [selectedVoice, setSelectedVoice] = useState(search.voice ?? "");
    const configuredModelRef = useRef(search.model ?? "");
    const linkedModelRef = useRef(search.model ?? "");
    const [result, setResult] = useState<PlaygroundResult | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const rejectWith =
        (
            messages: Record<"size" | "count" | "type", string>,
        ): NonNullable<FileUploadProps["onReject"]> =>
        (rejected) =>
            setError(messages[rejected[0].reason]);
    // Writes one tab's inputs and clears the other tab's from the URL.
    const showInUrl = useCallback(
        (values: PlaySearch) => {
            void navigate({
                replace: true,
                // Typing must not scroll the page.
                resetScroll: false,
                search: (prev) => ({
                    ...prev,
                    ...Object.fromEntries(
                        PLAY_SEARCH_KEYS.map((key) => [
                            key,
                            values[key] || undefined,
                        ]),
                    ),
                }),
            });
        },
        [navigate],
    );
    useEffect(() => {
        showInUrl({
            tab: activeCategory,
            model: selectedModel,
            prompt,
            size: selectedResolution,
            width,
            height,
            aspect: aspectRatio,
            duration: duration ? String(duration) : undefined,
            length: audioLength,
            seed,
            voice: selectedVoice,
            language,
        });
    }, [
        showInUrl,
        activeCategory,
        selectedModel,
        prompt,
        selectedResolution,
        width,
        height,
        aspectRatio,
        duration,
        audioLength,
        seed,
        selectedVoice,
        language,
    ]);

    // Community models stay off the playground menu: this page pitches the
    // official catalog, and owner/model entries would double the list. Every
    // pick below goes through this so state never lands on a hidden model.
    const visibleModels = useMemo(
        () =>
            catalog.models
                .filter((model) => !model.community)
                .map(playgroundModel)
                .filter((model): model is PlaygroundModel => model !== null)
                // Audio endpoints Play cannot call yet stay off the menu.
                .filter(
                    (model) =>
                        model.category !== "audio" || !!audioEndpoint(model),
                ),
        [catalog.models],
    );

    const currentModel = useMemo(
        () => visibleModels.find((model) => model.id === selectedModel),
        [visibleModels, selectedModel],
    );
    const audioTask =
        currentModel?.category === "audio"
            ? audioTaskForModel(currentModel)
            : undefined;

    const categoryModels = useMemo(
        () => modelsInCategory(visibleModels, activeCategory),
        [activeCategory, visibleModels],
    );

    // Picks the model for the open tab. One effect, so a linked ?model= and
    // the tab default never race on the same render. A link opens that
    // model's tab; older links use an alias, such as ?model=flux.
    useEffect(() => {
        if (!isHydrated || isLoading || catalogError) return;
        if (visibleModels.length === 0) return;
        const linked = linkedModelRef.current;
        linkedModelRef.current = "";
        const linkedModel = visibleModels.find(
            (model) =>
                !!linked &&
                (model.id === linked || model.aliases.includes(linked)),
        );
        const linkedCategory = CATEGORY_ORDER.find(
            (value) => value === linkedModel?.category,
        );
        if (linkedModel && linkedCategory) {
            setSelectedModel(linkedModel.id);
            setActiveCategory(linkedCategory);
            return;
        }
        // Keep a restored selection while discovery loads, or until the user
        // explicitly replaces a model that has left the catalog.
        if (selectedModel && !currentModel) return;
        if (currentModel?.category === activeCategory) return;
        setSelectedModel(defaultModelId(visibleModels, activeCategory));
        setAudioFiles([]);
    }, [
        activeCategory,
        currentModel,
        selectedModel,
        visibleModels,
        isHydrated,
        isLoading,
        catalogError,
    ]);

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
        if (configuredModelRef.current === currentModel.id) return;
        configuredModelRef.current = currentModel.id;
        // "" and 0 mean the model default; mediaModelSettings resolves them.
        setSelectedResolution("");
        setDuration(0);
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
        currentModel?.category === "video" &&
        currentModel.videoCapabilities.includes("start_frame") &&
        supportsReferenceImages;
    const isReferenceImageListMode =
        supportsReferenceImages && !isVideoReferenceMode;
    const supportsLastFrame =
        isVideoReferenceMode &&
        (currentModel?.videoCapabilities.includes("end_frame") ?? false) &&
        maxReferenceImages >= 2;
    const firstFrameFiles = referenceImages[0] ? [referenceImages[0]] : [];
    const lastFrameFiles = referenceImages[1] ? [referenceImages[1]] : [];
    const currentAudioEndpoint =
        currentModel?.category === "audio"
            ? audioEndpoint(currentModel)
            : undefined;
    const isAudioTranscription =
        currentAudioEndpoint === "/v1/audio/transcriptions";
    const showsAudioLength = audioTask === "music-and-sound-effects";
    const audioError =
        currentModel?.category === "audio"
            ? audioInputError(currentModel, prompt, audioFiles[0])
            : null;
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
    const mediaUploadLabel = uploadMedia.join(" or ");
    const MediaUploadIcon = isAudioTranscription
        ? MicIcon
        : CATEGORY_ICON[uploadMedia[0] ?? "audio"];
    const showPromptInput =
        currentModel?.category !== "audio" ||
        isAudioTranscription ||
        currentModel.inputModalities.includes("text");
    const promptLabel = isAudioTranscription
        ? "Instructions (optional)"
        : "Description";
    const selectedModelAllowed =
        !!currentModel &&
        isLoggedIn &&
        catalog.allowedModelIds.has(currentModel.id);
    const mediaSettings = mediaModelSettings(currentModel, {
        resolution: selectedResolution,
        duration,
    });
    const videoDuration =
        currentModel?.category === "video" ? mediaSettings.duration : undefined;
    const videoAspectRatio =
        currentModel?.category === "video" ? aspectRatio : undefined;
    const isVisualModel =
        currentModel?.category === "image" ||
        currentModel?.category === "video";
    // Few image models declare resolutions, but /image accepts width and
    // height for all of them. Blank keeps the model's default size.
    const customSize =
        currentModel?.category === "image" &&
        currentModel.resolutions.length === 0;
    const imageSize = customSize
        ? {
              width: Number(width) || undefined,
              height: Number(height) || undefined,
          }
        : {};
    // Blank means a new random seed each run; a fixed seed repeats a result.
    const fixedSeed = Number(seed) || undefined;
    // GET examples omit uploaded references; file-based audio needs POST.
    const audioGet =
        currentModel?.supportedEndpoints.includes("/audio/{text}") &&
        audioFiles.length === 0;
    const apiMethod = isVisualModel || audioGet ? "GET" : "POST";
    const apiFields: Record<string, string | number> | undefined =
        currentModel?.category === "audio" && !audioGet
            ? {
                  model: currentModel.id,
                  ...(showPromptInput &&
                  (!isAudioTranscription || prompt.trim())
                      ? {
                            [currentAudioEndpoint === "/v1/audio/speech" ||
                            currentAudioEndpoint === "/audio/{text}"
                                ? "input"
                                : "prompt"]:
                                prompt.trim() || "your-prompt-here",
                        }
                      : {}),
                  ...(currentModel.voices.length
                      ? { voice: selectedVoice }
                      : {}),
                  ...(showsAudioLength && Number(audioLength)
                      ? { duration: Number(audioLength) }
                      : {}),
                  ...(isAudioTranscription && language.trim()
                      ? { language: language.trim() }
                      : {}),
                  ...(requiresMediaUpload
                      ? {
                            file:
                                audioFiles[0]?.name ||
                                "YOUR_AUDIO_FILE (multipart upload)",
                        }
                      : audioFiles.length
                        ? { reference_audio: "YOUR_UPLOADED_AUDIO_URL" }
                        : {}),
              }
            : undefined;
    const apiUrl = currentModel
        ? apiMethod === "POST"
            ? `${API_BASE_URL}${currentAudioEndpoint === "/audio/{text}" ? "/v1/audio/speech" : currentAudioEndpoint}`
            : `${API_BASE_URL}/${currentModel.category}/${encodeURIComponent(
                  prompt.trim() || "your-prompt-here",
              )}?${new URLSearchParams(
                  Object.entries({
                      model: currentModel.id,
                      ...(isVisualModel
                          ? {
                                ...imageSize,
                                resolution: mediaSettings.resolution,
                                aspectRatio: videoAspectRatio,
                                duration: videoDuration?.value,
                                seed: fixedSeed,
                            }
                          : {
                                voice: selectedVoice || undefined,
                                duration: showsAudioLength
                                    ? Number(audioLength) || undefined
                                    : undefined,
                            }),
                      key: "YOUR_API_KEY",
                  }).flatMap(([name, value]) =>
                      value !== undefined && value !== ""
                          ? [[name, String(value)]]
                          : [],
                  ),
              )}`
        : null;

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
        setSelectedModel(defaultModelId(visibleModels, category));
    }

    function selectModel(modelId: string) {
        setSelectedModel(modelId);
        setAudioFiles([]);
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

        if (!apiKey || !currentModel || blockedReason) return;

        setIsGenerating(true);
        setError(null);
        setResult(null);

        try {
            const client = new Pollinations({
                apiKey,
                baseUrl: API_BASE_URL,
            });
            const requestSeed = fixedSeed ?? randomGenerationSeed();
            const referenceUrls = supportsReferenceImages
                ? await uploadReferenceImages(client, referenceImages)
                : [];

            if (currentModel.category === "video") {
                const response = await client.video(trimmedPrompt, {
                    model: currentModel.id,
                    duration: videoDuration?.value,
                    aspectRatio: videoAspectRatio || undefined,
                    resolution: mediaSettings.resolution,
                    seed: requestSeed,
                    referenceImage:
                        referenceUrls.length > 0 ? referenceUrls : undefined,
                });
                setResult(mediaResult("video", response));
                return;
            }

            if (currentModel.category === "image") {
                const response = await client.image(trimmedPrompt, {
                    model: currentModel.id,
                    ...imageSize,
                    resolution: mediaSettings.resolution,
                    seed: requestSeed,
                    referenceImage:
                        referenceUrls.length > 0 ? referenceUrls : undefined,
                });
                setResult(mediaResult("image", response));
                return;
            }

            if (currentModel.category === "audio") {
                const response = await generatePlaygroundAudio(
                    client,
                    currentModel,
                    {
                        prompt: trimmedPrompt,
                        file: audioFiles[0],
                        voice: selectedVoice || undefined,
                        duration: showsAudioLength
                            ? Number(audioLength) || undefined
                            : undefined,
                        language: isAudioTranscription
                            ? language.trim() || undefined
                            : undefined,
                    },
                );
                setResult(
                    response.type === "text"
                        ? response
                        : mediaResult("audio", response),
                );
                return;
            }
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
                  : currentAudioEndpoint === "/v1/audio/voice-changer"
                    ? "Change voice"
                    : currentAudioEndpoint === "/v1/audio/voice-isolator"
                      ? "Isolate speech"
                      : "Generate audio"
              : "Generate image";
    const GenerateIcon = isAudioTranscription
        ? MicIcon
        : CATEGORY_ICON[activeCategory];
    const connectLabel =
        currentModel?.category === "video"
            ? "Connect to create video"
            : currentModel?.category === "audio"
              ? isAudioTranscription
                  ? "Connect to transcribe audio"
                  : "Connect to create audio"
              : "Connect to generate image";

    // Signed out is a step, not a fault — handled by the button itself.
    const needsSignIn = isHydrated && !apiKey;
    const missingInput = requiresMediaUpload
        ? audioFiles.length === 0
        : !prompt.trim();

    /** Why the button cannot fire, or null when it can. Drives the tooltip. */
    const blockedReason = needsSignIn
        ? null
        : audioError
          ? audioError
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
                className="play-parameter-row min-w-0"
                label={
                    requiresMediaUpload
                        ? `${mediaUploadLabel.charAt(0).toUpperCase()}${mediaUploadLabel.slice(1)} input`
                        : "Reference audio (optional)"
                }
            >
                <FileUpload
                    value={audioFiles}
                    onChange={setAudioFiles}
                    maxFiles={1}
                    maxSizeBytes={AUDIO_UPLOAD_MAX_SIZE_BYTES}
                    accept={mediaUploadAccept}
                    icon={<MediaUploadIcon className="h-6 w-6 shrink-0" />}
                    previewIcon={<MediaUploadIcon className="h-5 w-5" />}
                    label={`Add ${mediaUploadLabel}`}
                    onReject={rejectWith({
                        size: "Media files must be under 20 MB.",
                        count: "Use one media file.",
                        type: `Use ${mediaUploadLabel} files for this model.`,
                    })}
                />
                {!requiresMediaUpload && audioFiles.length > 0 && (
                    <UploadPrivacyNote />
                )}
            </FieldStack>
        ) : null;
    return (
        <div className="relative z-10 flex w-full flex-col pb-12 text-theme-text-base sm:pb-16">
            <ModalityTabs
                activeCategory={activeCategory}
                onSelectCategory={selectCategory}
            />

            <div className="grid overflow-clip">
                {catalogError && (
                    <div className="pt-4">
                        <Alert intent="danger">
                            Model catalog failed to load: {catalogError.message}
                        </Alert>
                    </div>
                )}
                <div className="flex flex-col gap-4 pt-6">
                    <ModelPicker
                        models={categoryModels}
                        selectedModel={selectedModel}
                        isLoading={isLoading || !isHydrated}
                        onSelectModel={selectModel}
                        groupOf={
                            activeCategory === "audio"
                                ? (model) =>
                                      AUDIO_GROUP_LABEL[
                                          audioTaskForModel(model)
                                      ]
                                : undefined
                        }
                    />
                    {isHydrated &&
                        !isLoading &&
                        !catalogError &&
                        selectedModel &&
                        !currentModel && (
                            <Alert intent="warning">
                                Your selected model is unavailable. Choose
                                another model to continue.
                            </Alert>
                        )}
                    <section
                        aria-label="Generation inputs"
                        className="play-parameter-card flex flex-col gap-5"
                    >
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
                                        audioTask,
                                    )}
                                    className={cn(
                                        "lg:min-h-56",
                                        isAudioTranscription
                                            ? "min-h-24"
                                            : "min-h-44",
                                    )}
                                />
                            </FieldStack>
                        )}
                        <div className="play-parameter-grid">
                            {currentModel && currentModel.voices.length > 0 && (
                                <VoicePicker
                                    key={currentModel.id}
                                    voices={currentModel.voices}
                                    value={selectedVoice}
                                    onChange={setSelectedVoice}
                                />
                            )}
                            {audioInput}

                            {isAudioTranscription && (
                                <FieldStack
                                    label="Language"
                                    className="play-parameter-row min-w-0"
                                >
                                    <Input
                                        aria-label="Language"
                                        placeholder="Auto (e.g. en)"
                                        value={language}
                                        onChange={(event) =>
                                            setLanguage(event.target.value)
                                        }
                                    />
                                </FieldStack>
                            )}

                            {showsAudioLength && (
                                <FieldStack
                                    label="Length (seconds)"
                                    className="play-parameter-row min-w-0"
                                >
                                    <Input
                                        aria-label="Length in seconds"
                                        type="number"
                                        hideNumberSteppers
                                        min={0}
                                        step="any"
                                        placeholder="Model default"
                                        value={audioLength}
                                        onChange={(event) =>
                                            setAudioLength(event.target.value)
                                        }
                                    />
                                </FieldStack>
                            )}

                            {isReferenceImageListMode && (
                                <div className="min-w-0">
                                    <FieldStack
                                        className="play-parameter-row min-w-0"
                                        label={
                                            <span className="inline-flex flex-wrap items-center gap-2">
                                                Reference images
                                                <span
                                                    role="img"
                                                    aria-label={`${referenceImages.length} of ${maxReferenceImages} reference images`}
                                                    className="inline-flex items-center gap-1.5 text-xs tabular-nums text-theme-text-muted"
                                                >
                                                    <ImageIcon
                                                        aria-hidden="true"
                                                        className="h-3.5 w-3.5"
                                                    />
                                                    <span aria-hidden="true">
                                                        {referenceImages.length}
                                                        /{maxReferenceImages}
                                                    </span>
                                                </span>
                                            </span>
                                        }
                                    >
                                        <FileUpload
                                            value={referenceImages}
                                            onChange={setReferenceImages}
                                            maxFiles={maxReferenceImages}
                                            maxSizeBytes={
                                                IMAGE_UPLOAD_MAX_SIZE_BYTES
                                            }
                                            label="Add images"
                                            onReject={rejectWith({
                                                size: "Images must be under 5 MB each.",
                                                count: `Use up to ${maxReferenceImages === 1 ? "1 image" : `${maxReferenceImages} images`}.`,
                                                type: "Only image files are allowed.",
                                            })}
                                        />
                                        {referenceImages.length > 0 && (
                                            <UploadPrivacyNote />
                                        )}
                                    </FieldStack>
                                </div>
                            )}

                            {isVideoReferenceMode && (
                                <FieldStack
                                    label="Frame"
                                    className="play-parameter-row min-w-0"
                                >
                                    <div className="flex flex-wrap items-start gap-3">
                                        <fieldset
                                            className="m-0 min-w-0 border-0 p-0"
                                            aria-label="First image"
                                        >
                                            <FileUpload
                                                value={firstFrameFiles}
                                                onChange={(files) =>
                                                    setFrameImage(0, files)
                                                }
                                                maxFiles={1}
                                                maxSizeBytes={
                                                    IMAGE_UPLOAD_MAX_SIZE_BYTES
                                                }
                                                label="Add first image"
                                                onReject={rejectWith({
                                                    size: "Images must be under 5 MB each.",
                                                    count: "Use one first frame.",
                                                    type: "Only image files are allowed.",
                                                })}
                                            />
                                        </fieldset>

                                        {supportsLastFrame && (
                                            <fieldset
                                                className="m-0 min-w-0 border-0 p-0"
                                                aria-label="Last image"
                                            >
                                                <FileUpload
                                                    value={lastFrameFiles}
                                                    onChange={(files) =>
                                                        setFrameImage(1, files)
                                                    }
                                                    maxFiles={1}
                                                    maxSizeBytes={
                                                        IMAGE_UPLOAD_MAX_SIZE_BYTES
                                                    }
                                                    disabled={
                                                        firstFrameFiles.length ===
                                                        0
                                                    }
                                                    label="Add last image"
                                                    onReject={rejectWith({
                                                        size: "Images must be under 5 MB each.",
                                                        count: "Use one last frame.",
                                                        type: "Only image files are allowed.",
                                                    })}
                                                />
                                            </fieldset>
                                        )}
                                    </div>
                                </FieldStack>
                            )}

                            {isVideoReferenceMode &&
                                referenceImages.length > 0 && (
                                    <div className="col-span-full">
                                        <UploadPrivacyNote />
                                    </div>
                                )}

                            {isVisualModel && (
                                <div className="contents">
                                    {currentModel.resolutions.length > 1 ? (
                                        <FieldStack
                                            label="Resolution"
                                            className="play-parameter-row min-w-0"
                                        >
                                            <ButtonGroup aria-label="Resolution">
                                                {currentModel.resolutions.map(
                                                    (resolution) => (
                                                        <TabButton
                                                            key={resolution}
                                                            active={
                                                                mediaSettings.resolution ===
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
                                    ) : mediaSettings.resolution ? (
                                        <FieldStack
                                            label="Resolution"
                                            className="play-parameter-row min-w-0"
                                        >
                                            <ButtonGroup aria-label="Resolution">
                                                <TabButton
                                                    size="sm"
                                                    active
                                                    disabled
                                                    aria-label={`Fixed resolution: ${mediaSettings.resolution}`}
                                                >
                                                    {mediaSettings.resolution.toUpperCase()}
                                                </TabButton>
                                            </ButtonGroup>
                                        </FieldStack>
                                    ) : null}

                                    {currentModel.category === "video" && (
                                        <FieldStack
                                            label="Aspect ratio"
                                            className="play-parameter-row min-w-0"
                                        >
                                            <ButtonGroup aria-label="Aspect ratio">
                                                {VIDEO_ASPECT_RATIOS.map(
                                                    (ratio) => (
                                                        <TabButton
                                                            key={
                                                                ratio || "auto"
                                                            }
                                                            active={
                                                                aspectRatio ===
                                                                ratio
                                                            }
                                                            size="sm"
                                                            onClick={() =>
                                                                setAspectRatio(
                                                                    ratio,
                                                                )
                                                            }
                                                        >
                                                            {ratio || "Auto"}
                                                        </TabButton>
                                                    ),
                                                )}
                                            </ButtonGroup>
                                        </FieldStack>
                                    )}

                                    {videoDuration && (
                                        <FieldStack
                                            label="Duration"
                                            className="play-parameter-row min-w-0"
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <Slider
                                                    aria-label="Video duration"
                                                    disabled={
                                                        videoDuration.min ===
                                                        videoDuration.max
                                                    }
                                                    aria-valuetext={`${videoDuration.value} seconds`}
                                                    style={
                                                        {
                                                            "--polli-slider-fill":
                                                                "var(--polli-color-text-soft)",
                                                            "--polli-slider-track":
                                                                "var(--polli-color-bg-active)",
                                                        } as CSSProperties
                                                    }
                                                    min={
                                                        videoDuration.options
                                                            .length
                                                            ? 0
                                                            : videoDuration.min
                                                    }
                                                    max={
                                                        videoDuration.options
                                                            .length
                                                            ? videoDuration
                                                                  .options
                                                                  .length - 1
                                                            : videoDuration.max
                                                    }
                                                    step={
                                                        videoDuration.options
                                                            .length
                                                            ? 1
                                                            : videoDuration.step
                                                    }
                                                    value={
                                                        videoDuration.options
                                                            .length
                                                            ? videoDuration.options.indexOf(
                                                                  videoDuration.value,
                                                              )
                                                            : videoDuration.value
                                                    }
                                                    onChange={(event) => {
                                                        const value = Number(
                                                            event.target.value,
                                                        );
                                                        setDuration(
                                                            videoDuration
                                                                .options.length
                                                                ? videoDuration
                                                                      .options[
                                                                      value
                                                                  ]
                                                                : value,
                                                        );
                                                    }}
                                                />
                                                <MediaFact
                                                    label={`Selected duration: ${videoDuration.value} seconds`}
                                                >
                                                    <span aria-hidden="true">
                                                        {videoDuration.value}s
                                                    </span>
                                                </MediaFact>
                                            </div>
                                        </FieldStack>
                                    )}

                                    {customSize && (
                                        <FieldStack
                                            label="Dimensions"
                                            className="play-parameter-row min-w-0"
                                        >
                                            <div className="play-dimensions flex min-w-0 items-center gap-2">
                                                {(
                                                    [
                                                        [
                                                            "Width",
                                                            width,
                                                            setWidth,
                                                        ],
                                                        [
                                                            "Height",
                                                            height,
                                                            setHeight,
                                                        ],
                                                    ] as const
                                                ).map(
                                                    (
                                                        [
                                                            label,
                                                            value,
                                                            setValue,
                                                        ],
                                                        index,
                                                    ) => (
                                                        <Fragment key={label}>
                                                            {index > 0 && (
                                                                <span
                                                                    aria-hidden="true"
                                                                    className="text-theme-text-muted"
                                                                >
                                                                    ×
                                                                </span>
                                                            )}
                                                            <Input
                                                                aria-label={`${label} in pixels`}
                                                                type="number"
                                                                hideNumberSteppers
                                                                min={1}
                                                                step={1}
                                                                placeholder="Auto"
                                                                value={value}
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    setValue(
                                                                        event
                                                                            .target
                                                                            .value,
                                                                    )
                                                                }
                                                            />
                                                        </Fragment>
                                                    ),
                                                )}
                                                <span
                                                    aria-hidden="true"
                                                    className="text-sm text-theme-text-muted"
                                                >
                                                    px
                                                </span>
                                            </div>
                                        </FieldStack>
                                    )}

                                    <FieldStack
                                        label={
                                            <span className="inline-flex items-center gap-2">
                                                Seed
                                                <Tooltip
                                                    ariaLabel="About seed"
                                                    tapEnabled
                                                    content="A positive integer up to 2,147,483,647 (10 digits). Controls generation randomness. Reusing a seed can help reproduce a result with the same model and inputs."
                                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-theme-border text-xs text-theme-text-muted"
                                                >
                                                    ?
                                                </Tooltip>
                                            </span>
                                        }
                                        className="play-parameter-row min-w-0"
                                    >
                                        <Input
                                            aria-label="Seed"
                                            type="number"
                                            hideNumberSteppers
                                            min={1}
                                            max={2147483647}
                                            step={1}
                                            placeholder="Random"
                                            value={seed}
                                            onChange={(event) =>
                                                setSeed(event.target.value)
                                            }
                                        />
                                    </FieldStack>
                                </div>
                            )}
                        </div>
                    </section>

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
                            className="self-start"
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
                            onClick={needsSignIn ? () => login() : generate}
                            className="self-start"
                        >
                            {needsSignIn ? (
                                <LockIcon className="mr-2 h-4 w-4" />
                            ) : (
                                <GenerateIcon className="mr-2 h-4 w-4" />
                            )}
                            {isGenerating
                                ? isAudioTranscription
                                    ? "Transcribing…"
                                    : "Generating…"
                                : needsSignIn
                                  ? connectLabel
                                  : generateLabel}
                        </Button>
                    )}

                    {result && <ResultPanel result={result} />}
                    {apiUrl && (
                        <ApiUrlCard
                            url={
                                result && result.type !== "text"
                                    ? (result.requestUrl ?? apiUrl)
                                    : apiUrl
                            }
                            fields={
                                result &&
                                result.type !== "text" &&
                                result.type !== "audio"
                                    ? undefined
                                    : apiFields
                            }
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

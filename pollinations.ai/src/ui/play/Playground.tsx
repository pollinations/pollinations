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
    ClockIcon,
    cn,
    Dialog,
    DownloadIcon,
    Dropdown,
    EditableCombobox,
    ExpandIcon,
    FieldStack,
    FileUpload,
    type FileUploadProps,
    ImageIcon,
    LockIcon,
    MicIcon,
    RobotIcon,
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
import {
    type CSSProperties,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { API_BASE_URL } from "../../config";
import { Chat } from "./Chat";
import { errorMessage } from "./chat-models";
import { MediaFact, MediaModelOption } from "./MediaModelDetails";
import { downloadMedia } from "./media-download";
import {
    type MediaModelMetadata,
    mediaModelSettings,
} from "./media-model-settings";
import { readPlayDraft, useRememberPlayDraft } from "./play-draft";
import {
    audioEndpoint,
    audioInputError,
    generatePlaygroundAudio,
} from "./playground-audio";
import { UploadPrivacyNote } from "./UploadPrivacyNote";

type PlaygroundModel = MediaModelMetadata & {
    id: string;
    title: string;
    description: string;
    category: ModelCategory;
    inputModalities: string[];
    supportedEndpoints: string[];
    voices: string[];
    paidOnly?: boolean;
};

const AUDIO_TASK_ORDER = [
    "transcription",
    "speech-generation",
    "audio-processing",
    "music-and-sound-effects",
] as const;
type AudioTask = (typeof AUDIO_TASK_ORDER)[number];
const AUDIO_TASK_LABEL: Record<AudioTask, string> = {
    transcription: "Transcription",
    "speech-generation": "Speech generation",
    "audio-processing": "Voice & cleanup",
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
        paidOnly: model.paid_only,
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
const IMAGE_UPLOAD_MAX_SIZE_BYTES = 5 * 1024 * 1024;

type PlaygroundResult =
    | {
          type: "image" | "video" | "audio";
          url: string;
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

function mediaResult(
    type: "image" | "video" | "audio",
    { buffer, contentType }: { buffer: ArrayBuffer; contentType: string },
): PlaygroundResult {
    return {
        type,
        url: URL.createObjectURL(new Blob([buffer], { type: contentType })),
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
        audioPurpose.includes("sound effect") ||
        audioPurpose.includes("soundscape")
    )
        return "music-and-sound-effects";
    return "speech-generation";
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

function VoicePicker({
    voices,
    value,
    onChange,
}: {
    voices: string[];
    value: string;
    onChange: (voice: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    return (
        <div className="flex min-w-0 max-w-full items-center gap-3">
            <Text as="span" size="sm" weight="bold" className="shrink-0">
                Voice
            </Text>
            <div className="w-44 min-w-0 max-w-full">
                <EditableCombobox
                    aria-label="Voice"
                    value={open ? query : value}
                    options={voices}
                    placeholder="Search voices…"
                    emptyMessage="No voices match."
                    open={open}
                    onOpenChange={(next) => {
                        setOpen(next);
                        if (next) setQuery("");
                    }}
                    onChange={(next) => {
                        setQuery(next);
                        if (voices.includes(next)) onChange(next);
                    }}
                />
            </div>
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
                portalled={false}
                className="w-[34rem] max-w-[calc(100vw-2rem)] p-2"
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
                                    <MediaModelOption model={model} />
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
    onError,
}: {
    result: PlaygroundResult;
    className?: string;
    onError: (message: string | null) => void;
}) {
    const [downloading, setDownloading] = useState(false);
    const downloadRef = useRef<AbortController | null>(null);
    useEffect(() => () => downloadRef.current?.abort(), []);
    const label = `Download ${result.type}`;

    async function download() {
        if (downloadRef.current) return;
        const controller = new AbortController();
        downloadRef.current = controller;
        setDownloading(true);
        onError(null);
        try {
            await downloadMedia(
                downloadHref(result),
                "pollinations-playground",
                controller.signal,
            );
        } catch {
            if (!controller.signal.aborted)
                onError("Could not download this file. Try again.");
        } finally {
            downloadRef.current = null;
            setDownloading(false);
        }
    }

    return (
        <Button
            type="button"
            size="sm"
            aria-label={downloading ? "Downloading…" : label}
            title={label}
            disabled={downloading}
            className={cn(
                "h-10 w-10 shrink-0 self-auto rounded-full p-0",
                className,
            )}
            onClick={() => void download()}
        >
            <DownloadIcon
                className={cn("size-4", downloading && "animate-pulse")}
            />
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
            backdropBlur={false}
            contentClassName="relative border-0 p-3 sm:p-4"
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
                        className="max-h-[calc(100dvh-5rem)] w-full rounded-lg object-contain"
                    />
                ) : (
                    <video
                        src={result.url}
                        controls
                        autoPlay
                        loop
                        playsInline
                        className="max-h-[calc(100dvh-5rem)] w-full rounded-lg"
                    >
                        <track kind="captions" />
                    </video>
                ))}
        </Dialog>
    );
}

function ResultPanel({ result }: { result: PlaygroundResult }) {
    const [expanded, setExpanded] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    const zoomButtonClass =
        "flex h-full w-full cursor-zoom-in items-center justify-center border-0 bg-transparent p-0";

    if (result.type === "audio") {
        return (
            <>
                <div className="flex items-center gap-3 bg-surface-white p-4">
                    {/* biome-ignore lint/a11y/useMediaCaption: Generated audio has no timed caption file; an empty track creates a broken native menu. */}
                    <audio
                        src={result.url}
                        controls
                        controlsList="nodownload noplaybackrate"
                        autoPlay
                        className="polli-playground-audio min-w-0 flex-1"
                    />
                    <ResultDownloadButton
                        result={result}
                        onError={setDownloadError}
                    />
                </div>
                {downloadError && (
                    <Text size="xs" role="alert">
                        {downloadError}
                    </Text>
                )}
            </>
        );
    }

    return (
        <div className="flex min-h-[360px] flex-col p-4">
            {result.type === "text" ? (
                <div className="relative min-h-0 flex-1 overflow-auto rounded-xl bg-surface-white p-4 pr-16 text-theme-text-strong">
                    <ResultDownloadButton
                        result={result}
                        onError={setDownloadError}
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
                        onError={setDownloadError}
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

            {downloadError && (
                <Text size="xs" role="alert">
                    {downloadError}
                </Text>
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
    // One catalog for the whole page; Chat receives it instead of fetching
    // its own copy.
    const catalog = useModelCatalog({
        baseUrl: API_BASE_URL,
        enabled: isHydrated,
    });
    const { isLoading, error: catalogError } = catalog;
    const [restoredDraft] = useState(() =>
        readPlayDraft("media", {
            activeCategory: "text",
            audioTask: "speech-generation",
            selectedModel: "",
            prompt: "",
            selectedResolution: "",
            duration: 0,
            selectedVoice: "",
            hadAttachments: false,
        }),
    );
    const [activeCategory, setActiveCategory] = useState<PlaygroundCategory>(
        CATEGORY_ORDER.find(
            (value) => value === restoredDraft.activeCategory,
        ) ?? "text",
    );
    const [audioTask, setAudioTask] = useState<AudioTask>(
        AUDIO_TASK_ORDER.find((value) => value === restoredDraft.audioTask) ??
            "speech-generation",
    );
    const [selectedModel, setSelectedModel] = useState(
        restoredDraft.selectedModel,
    );
    const [prompt, setPrompt] = useState(restoredDraft.prompt);
    const [selectedResolution, setSelectedResolution] = useState(
        restoredDraft.selectedResolution,
    );
    const [duration, setDuration] = useState(restoredDraft.duration);
    const [referenceImages, setReferenceImages] = useState<File[]>([]);
    const [audioFiles, setAudioFiles] = useState<File[]>([]);
    const [selectedVoice, setSelectedVoice] = useState(
        restoredDraft.selectedVoice,
    );
    const [needsAttachments, setNeedsAttachments] = useState<boolean>(
        restoredDraft.hadAttachments,
    );
    const configuredModelRef = useRef(restoredDraft.selectedModel);
    const [result, setResult] = useState<PlaygroundResult | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const rejectWith =
        (
            messages: Record<"size" | "count" | "type", string>,
        ): NonNullable<FileUploadProps["onReject"]> =>
        (rejected) =>
            setError(messages[rejected[0].reason]);
    const draftSaveFailed = useRememberPlayDraft("media", {
        activeCategory,
        audioTask,
        selectedModel,
        prompt,
        selectedResolution,
        duration,
        selectedVoice,
        hadAttachments:
            referenceImages.length > 0 ||
            audioFiles.length > 0 ||
            needsAttachments,
    });
    useEffect(() => {
        if (referenceImages.length > 0 || audioFiles.length > 0)
            setNeedsAttachments(false);
    }, [referenceImages.length, audioFiles.length]);

    // Community models stay off the playground menu: this page pitches the
    // official catalog, and owner/model entries would double the list. Every
    // pick below goes through this so state never lands on a hidden model.
    const visibleModels = useMemo(
        () =>
            catalog.models
                .filter((model) => !model.community)
                .map(playgroundModel)
                .filter((model): model is PlaygroundModel => model !== null),
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
        if (
            activeCategory === "text" ||
            !isHydrated ||
            isLoading ||
            catalogError
        )
            return;
        // Keep a restored selection while discovery loads, or until the user
        // explicitly replaces a model that has left the catalog.
        if (selectedModel && !currentModel) return;
        if (
            currentModel?.category === activeCategory &&
            (activeCategory !== "audio" ||
                audioTaskForModel(currentModel) === audioTask)
        )
            return;
        setSelectedModel(categoryModels[0]?.id ?? "");
        setAudioFiles([]);
    }, [
        activeCategory,
        audioTask,
        categoryModels,
        currentModel,
        selectedModel,
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
    const mediaSettings = mediaModelSettings(currentModel, {
        resolution: selectedResolution,
        duration,
    });
    const videoDuration =
        currentModel?.category === "video" ? mediaSettings.duration : undefined;

    useEffect(() => {
        setReferenceImages((current) => {
            if (current.length <= maxReferenceImages) return current;
            return current.slice(0, maxReferenceImages);
        });
    }, [maxReferenceImages]);

    function selectCategory(category: PlaygroundCategory) {
        if (category === activeCategory) return;
        setNeedsAttachments(false);
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
        setNeedsAttachments(false);
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
        setNeedsAttachments(false);
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
            const requestSeed = randomGenerationSeed();
            const referenceUrls = supportsReferenceImages
                ? await uploadReferenceImages(client, referenceImages)
                : [];

            if (currentModel.category === "video") {
                const response = await client.video(trimmedPrompt, {
                    model: currentModel.id,
                    duration: videoDuration?.value,
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
                label={
                    requiresMediaUpload
                        ? `${mediaUploadLabel.charAt(0).toUpperCase()}${mediaUploadLabel.slice(1)} input`
                        : "Reference audio (optional)"
                }
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
                    onReject={rejectWith({
                        size: "Media files must be under 20 MB.",
                        count: "Use one media file.",
                        type: `Use ${mediaUploadLabel} files for this model.`,
                    })}
                />
                {isAudioTranscription && (
                    <Text size="xs" tone="muted">
                        Audio is sent to the selected model for transcription.
                    </Text>
                )}
                {!requiresMediaUpload && audioFiles.length > 0 && (
                    <UploadPrivacyNote />
                )}
            </FieldStack>
        ) : null;
    return (
        <div className="relative z-10 flex w-full flex-col text-theme-text-base">
            <ModalityTabs
                activeCategory={activeCategory}
                onSelectCategory={selectCategory}
            />

            <Chat catalog={catalog} active={activeCategory === "text"} />

            {activeCategory !== "text" && (
                <div className="grid overflow-clip">
                    {catalogError && (
                        <div className="pt-4">
                            <Alert intent="danger">
                                Model catalog failed to load:{" "}
                                {catalogError.message}
                            </Alert>
                        </div>
                    )}
                    <div className="flex flex-col gap-4 pt-6">
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
                            {currentModel && currentModel.voices.length > 0 && (
                                <VoicePicker
                                    key={currentModel.id}
                                    voices={currentModel.voices}
                                    value={selectedVoice}
                                    onChange={setSelectedVoice}
                                />
                            )}
                        </div>
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
                        {needsAttachments && (
                            <Text size="sm" tone="muted">
                                Your draft was restored. Please reattach your
                                files.
                            </Text>
                        )}
                        {draftSaveFailed && (
                            <Alert intent="warning">
                                Your browser couldn’t save this draft. Copy your
                                text before connecting.
                            </Alert>
                        )}
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
                                        "lg:min-h-56",
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
                                label="Reference images"
                                action={
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
                                            {referenceImages.length}/
                                            {maxReferenceImages}
                                        </span>
                                    </span>
                                }
                            >
                                <FileUpload
                                    value={referenceImages}
                                    onChange={setReferenceImages}
                                    variant="compact"
                                    maxFiles={maxReferenceImages}
                                    maxSizeBytes={IMAGE_UPLOAD_MAX_SIZE_BYTES}
                                    label={
                                        <>
                                            Drop images here or{" "}
                                            <span className="underline">
                                                browse
                                            </span>
                                        </>
                                    }
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
                        )}

                        {isVideoReferenceMode && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <FieldStack label="First frame">
                                    <FileUpload
                                        value={firstFrameFiles}
                                        onChange={(files) =>
                                            setFrameImage(0, files)
                                        }
                                        variant="compact"
                                        maxFiles={1}
                                        maxSizeBytes={
                                            IMAGE_UPLOAD_MAX_SIZE_BYTES
                                        }
                                        label={
                                            <>
                                                Drag first frame here or{" "}
                                                <span className="underline">
                                                    browse
                                                </span>
                                            </>
                                        }
                                        onReject={rejectWith({
                                            size: "Images must be under 5 MB each.",
                                            count: "Use one first frame.",
                                            type: "Only image files are allowed.",
                                        })}
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
                                            maxSizeBytes={
                                                IMAGE_UPLOAD_MAX_SIZE_BYTES
                                            }
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
                                            onReject={rejectWith({
                                                size: "Images must be under 5 MB each.",
                                                count: "Use one last frame.",
                                                type: "Only image files are allowed.",
                                            })}
                                        />
                                    </FieldStack>
                                )}
                            </div>
                        )}

                        {isVideoReferenceMode && referenceImages.length > 0 && (
                            <UploadPrivacyNote />
                        )}

                        {(currentModel?.category === "image" ||
                            currentModel?.category === "video") &&
                            (mediaSettings.resolution || videoDuration) && (
                                <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                                    {currentModel.resolutions.length > 1 ? (
                                        <FieldStack
                                            label="Resolution"
                                            className="w-fit min-w-0 max-w-full"
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
                                        <MediaFact
                                            label={`Fixed resolution: ${mediaSettings.resolution}`}
                                        >
                                            <ExpandIcon aria-hidden="true" />
                                            <span aria-hidden="true">
                                                {mediaSettings.resolution.toUpperCase()}
                                            </span>
                                        </MediaFact>
                                    ) : null}

                                    {videoDuration &&
                                        (videoDuration.min ===
                                        videoDuration.max ? (
                                            <MediaFact
                                                label={`Fixed duration: ${videoDuration.value} seconds`}
                                            >
                                                <ClockIcon aria-hidden="true" />
                                                <span aria-hidden="true">
                                                    {videoDuration.value}s
                                                </span>
                                            </MediaFact>
                                        ) : (
                                            <FieldStack
                                                label="Duration"
                                                className="w-56 max-w-full"
                                                action={
                                                    <MediaFact
                                                        label={`Selected duration: ${videoDuration.value} seconds`}
                                                    >
                                                        <ClockIcon aria-hidden="true" />
                                                        <span aria-hidden="true">
                                                            {
                                                                videoDuration.value
                                                            }
                                                            s
                                                        </span>
                                                    </MediaFact>
                                                }
                                            >
                                                <div className="flex flex-col gap-1">
                                                    <Slider
                                                        aria-label="Video duration"
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
                                                            videoDuration
                                                                .options.length
                                                                ? 0
                                                                : videoDuration.min
                                                        }
                                                        max={
                                                            videoDuration
                                                                .options.length
                                                                ? videoDuration
                                                                      .options
                                                                      .length -
                                                                  1
                                                                : videoDuration.max
                                                        }
                                                        step={
                                                            videoDuration
                                                                .options.length
                                                                ? 1
                                                                : videoDuration.step
                                                        }
                                                        value={
                                                            videoDuration
                                                                .options.length
                                                                ? videoDuration.options.indexOf(
                                                                      videoDuration.value,
                                                                  )
                                                                : videoDuration.value
                                                        }
                                                        onChange={(event) => {
                                                            const value =
                                                                Number(
                                                                    event.target
                                                                        .value,
                                                                );
                                                            setDuration(
                                                                videoDuration
                                                                    .options
                                                                    .length
                                                                    ? videoDuration
                                                                          .options[
                                                                          value
                                                                      ]
                                                                    : value,
                                                            );
                                                        }}
                                                    />
                                                    <div
                                                        aria-hidden="true"
                                                        className="flex justify-between text-xs tabular-nums text-theme-text-muted"
                                                    >
                                                        <span>
                                                            {videoDuration.min}s
                                                        </span>
                                                        <span>
                                                            {videoDuration.max}s
                                                        </span>
                                                    </div>
                                                </div>
                                            </FieldStack>
                                        ))}
                                </div>
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
                                onClick={needsSignIn ? () => login() : generate}
                                className="self-end"
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
                    </div>

                    {result && <ResultPanel result={result} />}
                </div>
            )}
        </div>
    );
}

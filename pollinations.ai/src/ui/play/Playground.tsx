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
    BrandMark,
    Button,
    ButtonGroup,
    ChevronIcon,
    Chip,
    cn,
    Dialog,
    DownloadIcon,
    Dropdown,
    FieldStack,
    FileUpload,
    type FileUploadProps,
    ImageIcon,
    InfoTip,
    Input,
    MediaPlaceholder,
    MicIcon,
    ScrollArea,
    Slider,
    StableLabel,
    Surface,
    TabButton,
    Text,
    Textarea,
    VideoIcon,
    XIcon,
} from "@pollinations/ui";
import {
    categoryLabel,
    ModalityTab,
    modalityBgVar,
    modalityTextColor,
} from "@pollinations/ui/gen";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
    Fragment,
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
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
    isVideo,
    supportsAudioLength,
    VIDEO_EXTENSIONS,
} from "./playground-audio";
import { type ModelRunStat, runStatsLine } from "./run-stats";
import { createRunStore } from "./run-store";
import { UploadPrivacyNote } from "./UploadPrivacyNote";
import { videoOptions } from "./video-options";

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
    publisher?: string;
    maxReferenceVideos?: number;
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
        publisher: model.publisher,
        maxReferenceVideos: model.max_reference_videos,
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
const REFERENCE_CAPABILITY = {
    image: "reference_images",
    video: "reference_videos",
    audio: "reference_audios",
} as const;
const MEDIA_PLURAL = {
    image: "images",
    video: "videos",
    audio: "audio",
} as const;
type UploadMedia = (typeof UPLOAD_MEDIA_ORDER)[number];
const UPLOAD_ACCEPT: Record<UploadMedia, string> = {
    image: "image/*",
    video: ["video/*", ...VIDEO_EXTENSIONS].join(","),
    audio: "audio/*,.mp3,.mpeg,.mpga,.m4a,.wav",
};
const UPLOAD_MAX_MB: Record<UploadMedia, number> = {
    image: 5,
    video: 20,
    audio: 20,
};

type PlaygroundResult =
    | {
          type: "image" | "video" | "audio";
          url: string;
          filename: string;
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
    { buffer, contentType }: { buffer: ArrayBuffer; contentType: string },
): PlaygroundResult {
    const mime = contentType.split(";")[0].trim();
    return {
        type,
        url: URL.createObjectURL(new Blob([buffer], { type: contentType })),
        filename: `pollinations-playground.${FILE_EXTENSIONS[mime] ?? mime.split("/")[1]}`,
    };
}

// Kept in memory so leaving /play and coming back restores the last inputs,
// result and any run still in flight. Nothing is written to disk.
let lastInputs: PlaySearch | undefined;
const runStore = createRunStore<PlaygroundResult>();

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
 * One alphabetical model list per tab. Audio models are grouped by
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
        .sort(
            (a, b) =>
                group(a) - group(b) ||
                a.title.localeCompare(b.title, "en", {
                    numeric: true,
                    sensitivity: "base",
                }),
        );
}

/** The catalog lists each tab's configured default model first. */
function defaultModelId(
    models: PlaygroundModel[],
    category: PlaygroundCategory,
): string {
    return models.find((model) => model.category === category)?.id ?? "";
}

/** A setting's choices as tabs, or its one fixed value as a chip. */
function OptionField({
    label,
    options,
    value,
    onChange,
    format = (option) => option,
}: {
    label: string;
    options: readonly string[];
    value: string | undefined;
    onChange: (option: string) => void;
    format?: (option: string) => string;
}) {
    if (options.length === 0) return null;
    return (
        <FieldStack label={label} orientation="inline" className="min-w-0">
            {options.length === 1 ? (
                <Chip
                    size="lg"
                    aria-label={`Fixed ${label.toLowerCase()}: ${format(options[0])}`}
                    className="justify-self-start"
                >
                    {format(options[0])}
                </Chip>
            ) : (
                <ButtonGroup aria-label={label}>
                    {options.map((option) => (
                        <TabButton
                            key={option || "auto"}
                            active={option === value}
                            size="sm"
                            onClick={() => onChange(option)}
                        >
                            {format(option)}
                        </TabButton>
                    ))}
                </ButtonGroup>
            )}
        </FieldStack>
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
        <FieldStack label="Voice" orientation="inline" className="min-w-0">
            <Dropdown
                portalled={false}
                className="w-80 max-w-[calc(100vw-2rem)] p-2"
                trigger={(open) => (
                    <Button
                        type="button"
                        intent="neutral"
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
                    <Button
                        type="button"
                        intent="neutral"
                        size="md"
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
                            {models.map((model, index) => {
                                const group = groupOf?.(model);
                                const startsGroup =
                                    group &&
                                    (index === 0 ||
                                        group !== groupOf?.(models[index - 1]));
                                return (
                                    <Fragment key={model.id}>
                                        {startsGroup && (
                                            <h3
                                                className={cn(
                                                    "mx-3 mb-1 self-start",
                                                    index > 0 ? "mt-4" : "mt-2",
                                                )}
                                            >
                                                <Chip
                                                    intent="neutral"
                                                    size="sm"
                                                >
                                                    {group}
                                                </Chip>
                                            </h3>
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
            size="icon"
            aria-label={label}
            title={label}
            className={cn("shrink-0 self-auto", className)}
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
                size="icon"
                className="absolute top-5 right-5 z-10"
            >
                <XIcon className="size-5" />
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

/** The result slot while an image or video is generating, in its modality's tint. */
function BusyPlaceholder({ category }: { category: "image" | "video" }) {
    const Icon = CATEGORY_ICON[category];
    return (
        <MediaPlaceholder
            busy
            tint={modalityBgVar(category)}
            icon={
                <Icon
                    aria-hidden="true"
                    className="size-6"
                    style={{ color: modalityTextColor(category) }}
                />
            }
            className="mx-auto w-full max-w-3xl"
        />
    );
}

function ResultPanel({ result }: { result: PlaygroundResult }) {
    const [expanded, setExpanded] = useState(false);

    const zoomButtonClass =
        "block w-full cursor-zoom-in border-0 bg-transparent p-0";

    if (result.type === "audio") {
        return (
            <Surface variant="card" className="flex items-center gap-3">
                {/* biome-ignore lint/a11y/useMediaCaption: Generated audio has no timed caption file; an empty track creates a broken native menu. */}
                <audio
                    src={result.url}
                    controls
                    controlsList="nodownload noplaybackrate"
                    autoPlay
                    className="play-audio min-w-0 flex-1"
                />
                <ResultDownloadButton result={result} />
            </Surface>
        );
    }

    return (
        <div className="w-full min-w-0">
            {result.type === "text" ? (
                <Surface
                    variant="card"
                    className="relative min-h-0 flex-1 overflow-auto pr-16 text-theme-text-strong"
                >
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
                </Surface>
            ) : (
                <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-card bg-surface-opaque text-theme-text-strong">
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

async function uploadFiles(
    client: Pollinations,
    files: File[],
): Promise<string[]> {
    const uploads = await Promise.all(
        files.map((file) => client.upload(file, { name: file.name })),
    );
    return uploads.map((upload) => upload.url);
}

export function Playground() {
    const dimensionsLabelId = useId();
    const { apiKey, isLoggedIn, isHydrated, error: authError } = useAuthState();
    const { login } = useAuthActions();
    const catalog = useModelCatalog({
        baseUrl: API_BASE_URL,
        enabled: isHydrated,
    });
    const { isLoading, error: catalogError } = catalog;
    const urlSearch = useSearch({ from: "/play" });
    const navigate = useNavigate({ from: "/play" });
    // A URL with Play keys wins; a bare /play restores the last inputs.
    const [search] = useState<PlaySearch>(() =>
        PLAY_SEARCH_KEYS.some((key) => urlSearch[key] !== undefined)
            ? urlSearch
            : (lastInputs ?? urlSearch),
    );
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
    const [audioLength, setAudioLength] = useState(search.length ?? "");
    const [language, setLanguage] = useState(search.language ?? "");
    const [seed, setSeed] = useState(search.seed ?? "");
    const [referenceImages, setReferenceImages] = useState<File[]>([]);
    const [videoReferences, setVideoReferences] = useState<
        Record<UploadMedia, File[]>
    >({ image: [], video: [], audio: [] });
    const [referenceMode, setReferenceMode] = useState(
        search.guidance === "references" ? "references" : "frames",
    );
    const [sound, setSound] = useState(search.sound ?? "");
    const [audioFiles, setAudioFiles] = useState<File[]>([]);
    const [voice, setVoice] = useState(search.voice ?? "");
    const configuredModelRef = useRef(search.model ?? "");
    const linkedModelRef = useRef(search.model ?? "");
    const { result, running, error } = useSyncExternalStore(
        runStore.subscribe,
        runStore.get,
    );
    const isGenerating = running !== null;
    const [stats, setStats] = useState<ModelRunStat[]>([]);
    const responseRef = useRef<HTMLDivElement>(null);
    const statusId = useId();
    // Shared FileUpload limits and rejection messages for these media.
    const uploadProps = (media: UploadMedia[], tooMany: string) => {
        const maxMb = Math.max(...media.map((item) => UPLOAD_MAX_MB[item]));
        const messages = {
            size: `Each file must be under ${maxMb} MB.`,
            count: tooMany,
            type: `Only ${media.join(" or ")} files are allowed.`,
        };
        const onReject: FileUploadProps["onReject"] = (rejected) =>
            runStore.set({ error: messages[rejected[0].reason] });
        return {
            accept: media.map((item) => UPLOAD_ACCEPT[item]).join(","),
            maxSizeBytes: maxMb * 1024 * 1024,
            onReject,
        };
    };
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
            configuredModelRef.current = linkedModel.id;
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

    // Falls back to the model's first voice; keeps a linked one while loading.
    const selectedVoice =
        !currentModel || currentModel.voices.includes(voice)
            ? voice
            : (currentModel.voices[0] ?? "");

    useEffect(() => {
        lastInputs = {
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
            sound,
            guidance:
                referenceMode === "references" ? referenceMode : undefined,
        };
        showInUrl(lastInputs);
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
        sound,
        referenceMode,
    ]);

    useEffect(() => {
        if (!currentModel) return;
        if (configuredModelRef.current === currentModel.id) return;
        configuredModelRef.current = currentModel.id;
        // "" and 0 mean the model default; mediaModelSettings resolves them.
        setSelectedResolution("");
        setDuration(0);
    }, [currentModel]);

    useEffect(() => {
        fetch(`${API_BASE_URL}/models/stats`)
            .then((response) => response.json())
            .then(({ data }) => setStats(data ?? []))
            .catch(() => {});
    }, []);

    // A new run brings its response area into view.
    useEffect(() => {
        if (isGenerating)
            responseRef.current?.scrollIntoView({ block: "nearest" });
    }, [isGenerating]);

    const videoConfig = videoOptions(
        currentModel?.id ?? "",
        currentModel?.videoCapabilities ?? [],
    );
    const videoSound = sound ? sound === "on" : videoConfig.defaultSound;
    const usesReferences =
        videoConfig.exclusiveReferences && referenceMode === "references";
    const maxReferenceImages = referenceImageLimit(currentModel);
    const supportsReferenceImages = maxReferenceImages > 0;
    const isVideoReferenceMode =
        currentModel?.category === "video" &&
        !usesReferences &&
        currentModel.videoCapabilities.includes("start_frame") &&
        supportsReferenceImages;
    const isReferenceImageListMode =
        supportsReferenceImages && currentModel?.category === "image";
    const supportsLastFrame =
        isVideoReferenceMode &&
        (currentModel?.videoCapabilities.includes("end_frame") ?? false) &&
        maxReferenceImages >= 2;
    const currentAudioEndpoint =
        currentModel?.category === "audio"
            ? audioEndpoint(currentModel)
            : undefined;
    const isAudioTranscription =
        currentAudioEndpoint === "/v1/audio/transcriptions";
    const showsAudioLength =
        currentModel &&
        audioTask === "music-and-sound-effects" &&
        supportsAudioLength(currentModel);
    const audioDuration = showsAudioLength
        ? Number(audioLength) || undefined
        : undefined;
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
    const mediaSettings = mediaModelSettings(
        currentModel?.id === "alibaba/wan-2.7" && usesReferences
            ? { ...currentModel, maxDuration: 10 }
            : currentModel,
        {
            resolution: selectedResolution,
            duration,
        },
    );
    const videoDuration =
        currentModel?.category === "video" ? mediaSettings.duration : undefined;
    // The reference uploads that are on screen for this model and mode.
    const videoReferenceMedia =
        currentModel?.category === "video" &&
        (!videoConfig.exclusiveReferences || usesReferences)
            ? UPLOAD_MEDIA_ORDER.filter((media) =>
                  currentModel.videoCapabilities.includes(
                      REFERENCE_CAPABILITY[media],
                  ),
              )
            : [];
    // An input image or video fixes the output shape, so Auto follows it;
    // otherwise Auto may render square and the default ratio applies.
    const sendsVisualInput =
        (supportsReferenceImages &&
            !usesReferences &&
            referenceImages.length > 0) ||
        videoReferenceMedia.some(
            (media) => media !== "audio" && videoReferences[media].length > 0,
        );
    // "" is not picked yet; an explicit Auto is stored as "auto".
    const pickedRatio = aspectRatio === "auto" ? "" : aspectRatio;
    const videoAspectRatio =
        currentModel?.category === "video"
            ? aspectRatio && videoConfig.ratios.includes(pickedRatio)
                ? pickedRatio
                : sendsVisualInput
                  ? videoConfig.ratios[0]
                  : videoConfig.defaultRatio
            : undefined;
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
                  ...(audioDuration !== undefined
                      ? { duration: audioDuration }
                      : {}),
                  ...(isAudioTranscription && language.trim()
                      ? { language: language.trim() }
                      : {}),
                  ...(requiresMediaUpload
                      ? {
                            file: "YOUR_AUDIO_FILE",
                        }
                      : audioFiles.length
                        ? isVideo(audioFiles[0])
                            ? { reference_video: "YOUR_UPLOADED_VIDEO_URL" }
                            : { reference_audio: "YOUR_UPLOADED_AUDIO_URL" }
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
                                ...(currentModel.category === "video" &&
                                videoConfig.sound === "optional"
                                    ? { audio: videoSound }
                                    : {}),
                            }
                          : {
                                voice: selectedVoice || undefined,
                                duration: audioDuration,
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
        setVideoReferences({ image: [], video: [], audio: [] });
        setReferenceMode("frames");
        setSound("");
    }

    function setFrameImage(index: number, files: File[]) {
        setReferenceImages((current) => {
            const next: Array<File | undefined> = [current[0], current[1]];
            next[index] = files[0];
            if (index === 0 && !files[0]) next[1] = undefined;
            return next.filter((file): file is File => !!file);
        });
    }

    async function generate() {
        const trimmedPrompt = prompt.trim();

        if (isGenerating || !apiKey || !currentModel || blockedReason) return;

        runStore.set({ running: activeCategory, error: null, result: null });

        try {
            const client = new Pollinations({
                apiKey,
                baseUrl: API_BASE_URL,
            });
            const requestSeed = fixedSeed ?? randomGenerationSeed();
            const referenceUrls =
                supportsReferenceImages && !usesReferences
                    ? await uploadFiles(client, referenceImages)
                    : [];

            if (currentModel.category === "video") {
                const [images, videos, audios] = await Promise.all(
                    UPLOAD_MEDIA_ORDER.map((media) =>
                        currentModel.videoCapabilities.includes(
                            REFERENCE_CAPABILITY[media],
                        ) &&
                        (!videoConfig.exclusiveReferences || usesReferences)
                            ? uploadFiles(client, videoReferences[media])
                            : Promise.resolve([]),
                    ),
                );
                const response = await client.video(trimmedPrompt, {
                    audio:
                        videoConfig.sound === "optional"
                            ? videoSound
                            : undefined,
                    referenceImages: images.length ? images : undefined,
                    referenceVideos: videos.length ? videos : undefined,
                    referenceAudios: audios.length ? audios : undefined,

                    model: currentModel.id,
                    duration: videoDuration?.value,
                    aspectRatio: videoAspectRatio || undefined,
                    resolution: mediaSettings.resolution,
                    seed: requestSeed,
                    referenceImage:
                        referenceUrls.length > 0 ? referenceUrls : undefined,
                });
                runStore.set({ result: mediaResult("video", response) });
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
                runStore.set({ result: mediaResult("image", response) });
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
                        duration: audioDuration,
                        language: isAudioTranscription
                            ? language.trim() || undefined
                            : undefined,
                    },
                );
                runStore.set({
                    result:
                        response.type === "text"
                            ? response
                            : mediaResult("audio", response),
                });
                return;
            }
        } catch (err) {
            runStore.set({ error: errorMessage(err) });
        } finally {
            runStore.set({ running: null });
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
    const busyLabel = isAudioTranscription ? "Transcribing…" : "Generating…";
    // The placeholder belongs to the tab whose run is in flight; audio has none.
    const busyVisual =
        running === "image" || running === "video" ? running : null;
    const hasResult =
        result &&
        (result.type === "text" ? "audio" : result.type) === activeCategory;
    const againLabel = generateLabel.startsWith("Generate ")
        ? "Generate again"
        : generateLabel;
    const generateText = (
        <StableLabel
            text={
                isGenerating
                    ? busyLabel
                    : hasResult
                      ? againLabel
                      : generateLabel
            }
            options={[generateLabel, againLabel, busyLabel]}
        />
    );
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

    /** Why the button cannot fire, or null when it can. Shown beside the button. */
    const blockedReason = needsSignIn
        ? null
        : audioError
          ? audioError
          : missingInput
            ? requiresMediaUpload
                ? `Upload ${mediaUploadLabel} first`
                : `Add ${promptLabel.toLowerCase()} first`
            : !selectedModelAllowed
              ? isLoading
                  ? "Models are loading"
                  : catalogError
                    ? "Models failed to load"
                    : !currentModel
                      ? "Choose an available model"
                      : "This key cannot use the selected model"
              : null;

    // The button's action; Cmd/Ctrl+Enter in the prompt does the same.
    const run = needsSignIn ? () => login() : generate;
    const statsLine = runStatsLine(
        stats.find((stat) => stat.model === currentModel?.id),
    );

    const audioInput =
        currentModel?.category === "audio" && acceptsMediaUpload ? (
            <FieldStack
                orientation="inline"
                className="min-w-0"
                label={
                    requiresMediaUpload
                        ? `${mediaUploadLabel.charAt(0).toUpperCase()}${mediaUploadLabel.slice(1)} input`
                        : `Reference ${mediaUploadLabel}${currentModel.inputModalities.includes("audio") ? " (optional)" : ""}`
                }
            >
                <FileUpload
                    value={audioFiles}
                    onChange={setAudioFiles}
                    maxFiles={1}
                    {...uploadProps(uploadMedia, "Use one media file.")}
                    icon={<MediaUploadIcon className="h-6 w-6 shrink-0" />}
                    previewIcon={<MediaUploadIcon className="h-5 w-5" />}
                    label={`Add ${mediaUploadLabel}`}
                />
                {!requiresMediaUpload && audioFiles.length > 0 && (
                    <UploadPrivacyNote />
                )}
            </FieldStack>
        ) : null;
    return (
        <div className="relative z-10 flex w-full flex-col pb-12 text-theme-text-base sm:pb-16">
            {/* Phones: one row of three equal tabs instead of wrapping "Audio". */}
            <fieldset
                aria-label="Modality"
                className="m-0 grid min-w-0 grid-cols-3 gap-2 border-0 p-0 sm:flex sm:flex-wrap"
            >
                {CATEGORY_ORDER.map((category) => (
                    <ModalityTab
                        key={category}
                        active={category === activeCategory}
                        size="lg"
                        modality={category}
                        icon={CATEGORY_ICON[category]}
                        className="max-sm:px-2"
                        onClick={() => selectCategory(category)}
                    >
                        {categoryLabel(category)}
                    </ModalityTab>
                ))}
            </fieldset>

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
                    <Surface
                        as="section"
                        variant="card"
                        aria-label="Generation inputs"
                        className="flex flex-col gap-5"
                    >
                        {showPromptInput && (
                            <FieldStack label={promptLabel}>
                                <Textarea
                                    value={prompt}
                                    rows={isAudioTranscription ? 3 : 7}
                                    onChange={(event) =>
                                        setPrompt(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                        if (
                                            event.key === "Enter" &&
                                            (event.metaKey || event.ctrlKey)
                                        ) {
                                            event.preventDefault();
                                            run();
                                        }
                                    }}
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
                                    onChange={setVoice}
                                />
                            )}
                            {audioInput}

                            {isAudioTranscription && (
                                <FieldStack
                                    label="Language"
                                    orientation="inline"
                                    className="min-w-0"
                                >
                                    <Input
                                        className="max-w-40"
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
                                    orientation="inline"
                                    className="min-w-0"
                                >
                                    <Input
                                        className="max-w-40"
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
                                        orientation="inline"
                                        className="min-w-0"
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
                                            {...uploadProps(
                                                ["image"],
                                                `Use up to ${maxReferenceImages === 1 ? "1 image" : `${maxReferenceImages} images`}.`,
                                            )}
                                            label="Add images"
                                        />
                                        {referenceImages.length > 0 && (
                                            <UploadPrivacyNote />
                                        )}
                                    </FieldStack>
                                </div>
                            )}

                            {currentModel?.category === "video" &&
                                videoConfig.exclusiveReferences && (
                                    <OptionField
                                        label="Guidance"
                                        options={["frames", "references"]}
                                        value={referenceMode}
                                        onChange={setReferenceMode}
                                        format={(mode) =>
                                            mode === "frames"
                                                ? "Frames"
                                                : "References"
                                        }
                                    />
                                )}
                            {videoReferenceMedia.map((media) => {
                                const Icon = CATEGORY_ICON[media];
                                const maxVideos =
                                    media === "video"
                                        ? currentModel?.maxReferenceVideos
                                        : undefined;
                                return (
                                    <FieldStack
                                        key={media}
                                        label={`Reference ${MEDIA_PLURAL[media]}`}
                                        orientation="inline"
                                        className="min-w-0"
                                    >
                                        <FileUpload
                                            value={videoReferences[media]}
                                            onChange={(files) =>
                                                setVideoReferences(
                                                    (previous) => ({
                                                        ...previous,
                                                        [media]: files,
                                                    }),
                                                )
                                            }
                                            maxFiles={maxVideos ?? Infinity}
                                            {...uploadProps(
                                                [media],
                                                maxVideos
                                                    ? `Use up to ${maxVideos === 1 ? "1 video" : `${maxVideos} videos`}.`
                                                    : "Too many files.",
                                            )}
                                            label={`Add ${MEDIA_PLURAL[media]}`}
                                            icon={
                                                <Icon className="h-6 w-6 shrink-0" />
                                            }
                                            // Images preview as thumbnails.
                                            previewIcon={
                                                media ===
                                                "image" ? undefined : (
                                                    <Icon className="h-6 w-6" />
                                                )
                                            }
                                        />
                                    </FieldStack>
                                );
                            })}
                            {videoReferenceMedia.some(
                                (media) => videoReferences[media].length > 0,
                            ) && (
                                <div className="col-span-full">
                                    <UploadPrivacyNote />
                                </div>
                            )}
                            {isVideoReferenceMode && (
                                <FieldStack
                                    label="Frame"
                                    orientation="inline"
                                    className="min-w-0"
                                >
                                    <div className="flex flex-wrap items-start gap-3">
                                        {(supportsLastFrame
                                            ? (["first", "last"] as const)
                                            : (["first"] as const)
                                        ).map((frame, index) => (
                                            <fieldset
                                                key={frame}
                                                className="m-0 min-w-0 border-0 p-0"
                                                aria-label={`${frame === "first" ? "First" : "Last"} image`}
                                            >
                                                <FileUpload
                                                    value={referenceImages.slice(
                                                        index,
                                                        index + 1,
                                                    )}
                                                    onChange={(files) =>
                                                        setFrameImage(
                                                            index,
                                                            files,
                                                        )
                                                    }
                                                    maxFiles={1}
                                                    {...uploadProps(
                                                        ["image"],
                                                        `Use one ${frame} frame.`,
                                                    )}
                                                    // The last frame needs a first.
                                                    disabled={
                                                        index > 0 &&
                                                        !referenceImages[0]
                                                    }
                                                    label={`Add ${frame} image`}
                                                />
                                            </fieldset>
                                        ))}
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
                                    <OptionField
                                        label="Resolution"
                                        options={currentModel.resolutions}
                                        value={mediaSettings.resolution}
                                        onChange={setSelectedResolution}
                                        format={(resolution) =>
                                            resolution.toUpperCase()
                                        }
                                    />

                                    {currentModel.category === "video" && (
                                        <>
                                            <OptionField
                                                label="Aspect ratio"
                                                options={videoConfig.ratios}
                                                value={videoAspectRatio}
                                                onChange={(ratio) =>
                                                    setAspectRatio(
                                                        ratio || "auto",
                                                    )
                                                }
                                                format={(ratio) =>
                                                    ratio || "Auto"
                                                }
                                            />
                                            <OptionField
                                                label="Sound"
                                                options={
                                                    videoConfig.sound ===
                                                    "optional"
                                                        ? ["on", "off"]
                                                        : [videoConfig.sound]
                                                }
                                                value={
                                                    videoSound ? "on" : "off"
                                                }
                                                onChange={setSound}
                                                format={(value) =>
                                                    value === "on"
                                                        ? "On"
                                                        : "Off"
                                                }
                                            />
                                        </>
                                    )}
                                    {videoDuration && (
                                        <FieldStack
                                            label="Duration"
                                            orientation="inline"
                                            className="min-w-0"
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <Slider
                                                    aria-label="Video duration"
                                                    disabled={
                                                        videoDuration.min ===
                                                        videoDuration.max
                                                    }
                                                    aria-valuetext={`${videoDuration.value} seconds`}
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
                                                {/* The slider's aria-valuetext already reads the value. */}
                                                <span
                                                    aria-hidden="true"
                                                    className="text-xs tabular-nums text-theme-text-muted"
                                                >
                                                    {videoDuration.value}s
                                                </span>
                                            </div>
                                        </FieldStack>
                                    )}

                                    {customSize && (
                                        <fieldset
                                            aria-labelledby={dimensionsLabelId}
                                            className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 max-sm:grid-cols-[5.5rem_minmax(0,1fr)] max-sm:gap-x-2"
                                        >
                                            <Text
                                                as="span"
                                                id={dimensionsLabelId}
                                                size="sm"
                                                weight="semibold"
                                                tone="strong"
                                            >
                                                Dimensions
                                            </Text>
                                            <div className="flex min-w-0 items-center gap-2">
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
                                                                className="w-24 min-w-0 px-2"
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
                                        </fieldset>
                                    )}

                                    <FieldStack
                                        label={
                                            <span className="inline-flex items-center">
                                                Seed
                                                <InfoTip
                                                    label="About seed"
                                                    tapEnabled
                                                    content="A positive integer up to 2,147,483,647 (10 digits). Controls generation randomness. Reusing a seed can help reproduce a result with the same model and inputs."
                                                />
                                            </span>
                                        }
                                        orientation="inline"
                                        className="min-w-0"
                                    >
                                        <Input
                                            aria-label="Seed"
                                            className="max-w-40"
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
                        {/* One line stays reserved, so switching models moves nothing. */}
                        <Text size="xs" tone="muted" className="min-h-5">
                            {statsLine}
                            {statsLine.startsWith("Average") && (
                                <InfoTip
                                    label="About this cost"
                                    tapEnabled
                                    content="From paid requests over the last 7 days. Yours depends on your settings."
                                />
                            )}
                        </Text>
                    </Surface>

                    {/* Not connected is not a broken state, so the button
                            becomes the connect action. When it genuinely
                            cannot fire, the line beside it says why. */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <Button
                            size="lg"
                            intent="brand"
                            // The page's main action: nectar whether it signs
                            // in or generates. Busy fills with honey and shows
                            // Polli. aria-disabled, not disabled, so focus
                            // stays on the button; generate() ignores repeats.
                            disabled={!!blockedReason}
                            aria-disabled={isGenerating || undefined}
                            aria-busy={isGenerating}
                            aria-describedby={statusId}
                            icon={needsSignIn ? undefined : <GenerateIcon />}
                            onClick={run}
                            className={cn(
                                needsSignIn && "h-12 gap-2 px-5 py-0",
                            )}
                        >
                            {needsSignIn ? (
                                <>
                                    <BrandMark className="h-6 w-6" />
                                    {connectLabel}
                                </>
                            ) : (
                                generateText
                            )}
                        </Button>
                        {/* One line stays reserved, so text never moves anything. */}
                        <Text
                            id={statusId}
                            size="xs"
                            tone="muted"
                            className="min-h-5 max-sm:w-full"
                        >
                            {blockedReason}
                        </Text>
                    </div>

                    {/* Holds the result's place while an image or video is
                        on its way, so the API card below moves once, not
                        twice. Audio keeps just the button's cue. */}
                    {(error ||
                        authError ||
                        hasResult ||
                        busyVisual === activeCategory) && (
                        <div ref={responseRef} className="flex flex-col gap-4">
                            {error && <Alert intent="danger">{error}</Alert>}
                            {authError && (
                                <Alert intent="danger">
                                    Could not connect your account:{" "}
                                    {authError.message}
                                </Alert>
                            )}
                            {busyVisual === activeCategory && (
                                <BusyPlaceholder category={busyVisual} />
                            )}
                            {result && hasResult && (
                                <ResultPanel result={result} />
                            )}
                        </div>
                    )}
                    {apiUrl && <ApiUrlCard url={apiUrl} fields={apiFields} />}
                </div>
            </div>
        </div>
    );
}

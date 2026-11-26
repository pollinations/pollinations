import {
    type DecisionAnswer,
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
    AudioInput,
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
    GitBranchIcon,
    GitHubIcon,
    ImageIcon,
    InfoTip,
    InlineLink,
    Input,
    LoadingStatus,
    MediaPlaceholder,
    MicIcon,
    RobotIcon,
    ScrollArea,
    Slider,
    StableLabel,
    Surface,
    TabButton,
    Text,
    Textarea,
    UploadedFileTile,
    VideoIcon,
    VideoRecorder,
    WarningIcon,
    XIcon,
} from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import {
    ModalityTab,
    modalityBgVar,
    modalityTextColor,
} from "@pollinations/ui/gen";
import {
    WalletKindIcon,
    type WalletKindIconProps,
} from "@pollinations/ui/wallet";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
    Fragment,
    type ReactNode,
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import {
    calculatePerPollen,
    hasFreePricing,
    typicalRequestCost,
} from "../../../../shared/model-price-display";
import { isNewModel } from "../../../../shared/model-recency";
import { API_BASE_URL, DEFAULT_AGENT_ID, ENTER_URL } from "../../config";
import { LINKS } from "../../copy/content/socialLinks";
import {
    type AudioCatalogMetadata,
    playgroundAudioMetadata,
    playgroundModelOverride,
} from "../../data/playground-model-overrides";
import { PLAY_SEARCH_KEYS, type PlaySearch } from "../../routes/-play-search";
import { AgentChat, useAgentChat } from "./AgentChat";
import { ApiUrlCard } from "./ApiUrlCard";
import { audioEndpoint, audioTaskGroups, audioTaskIds } from "./audio-endpoint";
import {
    type ConnectDrafts,
    saveConnectDraft,
    type VideoReference,
} from "./connect-draft";
import { DecisionAnswerPanel } from "./DecisionAnswerPanel";
import { DecisionCriteriaFields } from "./DecisionCriteriaFields";
import { decisionForm, questionTypeLabel, URGENCY_EXAMPLE } from "./decision";
import {
    type ImageFormats,
    imageActionLabel,
    imageFormatLabel,
    type imageMime,
    imageOutput,
    imageResult,
    previewImageFormats,
} from "./image-output";
import { MediaModelOption } from "./MediaModelOption";
import {
    type MediaModelMetadata,
    mediaModelSettings,
} from "./media-model-settings";
import {
    agentAttachments,
    agentFilters,
    matchesAgentFilter,
    modelAbilities,
    takesFileLinks,
} from "./model-abilities";
import {
    audioConstraintError,
    audioInputError,
    audioTaskForModel,
    generatePlaygroundAudio,
    isVideo,
    type ReferenceUploads,
    supportsAudioLength,
    transcriptionControls,
    uploadReference,
    VIDEO_EXTENSIONS,
} from "./playground-audio";
import {
    fastModelsByTime,
    formatRunCost,
    formatRunTime,
    type ModelRunStat,
} from "./run-stats";
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
    /** Catalog capabilities such as web_search, for the ability chips. */
    capabilities: string[];
    mcpServers?: string[];
    outputFormats?: ImageFormats;
    supportedEndpoints: string[];
    voices: string[];
    paidOnly: boolean;
    free: boolean;
    publisher?: string;
    /** Community listings show their owner's uploaded logo, else their type. */
    community: boolean;
    /** Published by an official Pollinations account. */
    verified: boolean;
    brandIconUrl?: string;
    /** Listed on the Agent tab; reached through /v1/responses. */
    agent: boolean;
    addedDate?: number;
    maxReferenceVideos?: number;
    maxReferenceAudios?: number;
    audioInputConstraints?: AudioCatalogMetadata["audio_input_constraints"];
    transcriptionOptions?: AudioCatalogMetadata["transcription_options"];
};

const WORKSPACES = [
    {
        label: "Agent",
        icon: RobotIcon,
        category: "text",
        operations: ["agent"],
    },
    {
        label: "Image",
        icon: ImageIcon,
        category: "image",
        operations: ["image"],
    },
    {
        label: "Video",
        icon: VideoIcon,
        category: "video",
        operations: ["video"],
    },
    {
        label: "Audio",
        icon: AudioIcon,
        category: "audio",
        operations: audioTaskIds,
    },
    {
        label: "Decide",
        icon: GitBranchIcon,
        category: "decision",
        operations: ["decide"],
    },
] as const;
/** Agents publish no image limit; this keeps a message to a few attachments. */
const AGENT_MAX_IMAGES = 4;
type Workspace = (typeof WORKSPACES)[number];
const TASKS = WORKSPACES.flatMap((workspace) =>
    workspace.operations.map((id) => ({
        id,
        workspace,
        runStore: createRunStore<PlaygroundResult>(),
    })),
);
type Task = (typeof TASKS)[number];

/** Run by its owner rather than Pollinations; listed after official models. */
function isCommunityRun(model: { community: boolean; verified: boolean }) {
    return model.community && !model.verified;
}

function playgroundModel(
    model: ModelInfo & AudioCatalogMetadata & { added_date?: number },
): PlaygroundModel | null {
    const id = model.id ?? model.name;
    if (!id || !model.category) return null;
    const override = playgroundModelOverride(id);

    return {
        id,
        aliases: model.aliases ?? [],
        title: model.title ?? model.name,
        description: model.description ?? "",
        category: model.category,
        inputModalities: model.input_modalities ?? [],
        outputFormats: previewImageFormats(model, override?.imageFormats),
        supportedEndpoints: model.supported_endpoints ?? [],
        videoCapabilities: model.video_capabilities ?? [],
        capabilities: model.capabilities ?? [],
        mcpServers: Array.isArray(model.mcp_servers)
            ? model.mcp_servers.filter(
                  (id): id is string => typeof id === "string",
              )
            : undefined,
        resolutions: model.resolutions ?? [],
        minDuration: model.min_duration,
        maxDuration: model.max_duration,
        defaultDuration: model.default_duration,
        allowedDurations: model.allowed_durations ?? [],
        durationStep: model.duration_step,
        maxReferenceImages:
            model.max_reference_images ??
            (model.agent ? AGENT_MAX_IMAGES : undefined),
        voices: model.voices ?? [],
        // Gen treats a missing flag as not paid-only.
        paidOnly: model.paid_only ?? false,
        free: hasFreePricing(model),
        agent: !!model.agent,
        addedDate: model.added_date,
        publisher: model.publisher,
        community: !!model.community,
        verified: model.verified === true,
        brandIconUrl:
            typeof model.brand_icon_url === "string"
                ? model.brand_icon_url
                : undefined,
        maxReferenceVideos: model.max_reference_videos,
        ...playgroundAudioMetadata(id, model),
    };
}

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
type UploadMedia = (typeof UPLOAD_MEDIA_ORDER)[number];
const UPLOAD_ACCEPT: Record<UploadMedia, string> = {
    image: "image/*",
    video: ["video/*", ...VIDEO_EXTENSIONS].join(","),
    audio: "audio/*,.mp3,.mpeg,.mpga,.m4a,.wav",
};

type MediaResult =
    | ReturnType<typeof imageResult>
    | {
          type: "video" | "audio" | "stems";
          url: string;
          filename: string;
      }
    | {
          type: "text";
          text: string;
      };

type PlaygroundResult =
    | MediaResult
    | { type: "decision"; answer: DecisionAnswer; question: string };

function promptPlaceholder(
    task: Task,
    editsImage: boolean,
    format?: keyof typeof imageMime,
): string {
    const {
        id,
        workspace: { category },
    } = task;
    if (id === "decide") return "Describe the situation…";
    if (format === "gif") return "Describe the animation you want…";
    if (format === "svg" && !editsImage)
        return "Describe the vector image you want…";
    if (editsImage) return "Describe the changes you want…";
    if (category === "image") return "Describe the image you want…";
    if (category === "video") return "Describe the video you want…";
    if (id === "transcription")
        return "Optional vocabulary, names, or context for the transcript…";
    if (id === "speech-generation") return "Enter the words you want spoken…";
    if (id === "music-and-sound-effects")
        return "Describe the music or sound you want…";
    return "Describe what you want…";
}

/** MIME subtypes that are not the usual file extension. */
const FILE_EXTENSIONS: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/x-wav": "wav",
    "video/quicktime": "mov",
};

function mediaResult(
    type: "video" | "audio",
    { buffer, contentType }: { buffer: ArrayBuffer; contentType: string },
): PlaygroundResult {
    const mime = contentType.split(";")[0].trim();
    return {
        type,
        url: URL.createObjectURL(new Blob([buffer], { type: contentType })),
        filename: `pollinations-playground.${FILE_EXTENSIONS[mime] ?? mime.split("/")[1]}`,
    };
}

/**
 * One media link from an agent's reply, fetched like any other result so it
 * gets the same panel. A link that cannot load stays a plain link.
 */
function AgentMedia({ url }: { url: string }) {
    const [result, setResult] = useState<PlaygroundResult | null>();
    useEffect(() => {
        let objectUrl: string | undefined;
        let active = true;
        const request = new AbortController();
        fetch(url, {
            credentials: "omit",
            referrerPolicy: "no-referrer",
            signal: request.signal,
        })
            .then(async (response) => {
                if (!response.ok) throw new Error(response.statusText);
                const media = {
                    buffer: await response.arrayBuffer(),
                    contentType: response.headers.get("content-type") ?? "",
                };
                const kind = (["audio", "video"] as const).find((type) =>
                    media.contentType.startsWith(`${type}/`),
                );
                const next = kind
                    ? mediaResult(kind, media)
                    : imageResult(media);
                if ("url" in next) objectUrl = next.url;
                if (active) setResult(next);
                else if (objectUrl) URL.revokeObjectURL(objectUrl);
            })
            .catch(() => {
                if (active) setResult(null);
            });
        return () => {
            active = false;
            request.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url]);
    if (result === undefined)
        return <LoadingStatus>Loading media…</LoadingStatus>;
    if (result === null) return <InlineLink href={url}>{url}</InlineLink>;
    return <ResultPanel result={result} />;
}

// Kept in memory so leaving /play and coming back restores the last inputs,
// result and any run still in flight. Connect saves selected files for the redirect.
let lastInputs: PlaySearch | undefined;

function randomGenerationSeed(): number {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] & 0x7fffffff;
}

function uploadMediaForModel(model: PlaygroundModel): UploadMedia[] {
    return model.inputModalities.filter((modality): modality is UploadMedia =>
        UPLOAD_MEDIA_ORDER.includes(modality as UploadMedia),
    );
}

function exampleReferenceUrls(media: UploadMedia, files: File[]) {
    return files
        .map(
            (_, index) =>
                `YOUR_UPLOADED_${media.toUpperCase()}_URL_${index + 1}`,
        )
        .join("|");
}

function supportsTask(model: PlaygroundModel, task: Task) {
    if (model.category !== task.workspace.category) return false;
    if (task.id === "agent")
        return (
            model.agent && model.supportedEndpoints.includes("/v1/responses")
        );
    if (task.id === "decide")
        return model.supportedEndpoints.includes("/alpha/decisions");
    if (model.category === "audio") return audioTaskForModel(model) === task.id;
    return true;
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
                    data-theme="neutral"
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

function VideoDurationField({
    duration,
    onChange,
}: {
    duration: NonNullable<ReturnType<typeof mediaModelSettings>["duration"]>;
    onChange: (seconds: string) => void;
}) {
    const { min, max, options, step, value } = duration;
    const count = options.length || Math.floor((max - min) / step) + 1;
    const secondsAt = (index: number) => options[index] ?? min + index * step;

    if (count <= 6) {
        return (
            <OptionField
                label="Duration"
                options={Array.from({ length: count }, (_, i) =>
                    String(secondsAt(i)),
                )}
                value={String(value)}
                onChange={onChange}
                format={(seconds) => `${seconds}s`}
            />
        );
    }

    return (
        <FieldStack label="Duration" orientation="inline" className="min-w-0">
            <div className="flex min-w-0 max-w-64 items-center gap-3">
                <Slider
                    aria-label="Video duration"
                    aria-valuetext={`${value} seconds`}
                    min={0}
                    max={count - 1}
                    step={1}
                    value={
                        options.length
                            ? options.indexOf(value)
                            : (value - min) / step
                    }
                    onChange={(event) =>
                        onChange(String(secondsAt(Number(event.target.value))))
                    }
                />
                <span
                    aria-hidden="true"
                    className="text-xs tabular-nums text-theme-text-muted"
                >
                    {value}s
                </span>
            </div>
        </FieldStack>
    );
}

function capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
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
    if (voices.length <= 6) {
        return (
            <OptionField
                label="Voice"
                options={voices}
                format={capitalize}
                value={value}
                onChange={onChange}
            />
        );
    }
    return (
        <FieldStack label="Voice" orientation="inline" className="min-w-0">
            <Dropdown
                portalled={false}
                className="w-[var(--reference-width)] overscroll-y-contain p-2"
                trigger={(open) => (
                    <Button
                        type="button"
                        intent="neutral"
                        className="w-fit max-w-full self-start justify-between gap-2"
                        aria-label={`Voice: ${capitalize(value)}`}
                    >
                        <span className="truncate">{capitalize(value)}</span>
                        <ChevronIcon expanded={open} />
                    </Button>
                )}
            >
                {(close) => (
                    <ScrollArea className="max-h-80 overscroll-y-contain pr-2">
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
                                    {capitalize(voice)}
                                </TabButton>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </Dropdown>
        </FieldStack>
    );
}

const imageFilters = { edit: "Edit", gif: "GIF", svg: "SVG", "4k": "4K" };
const videoFilters = {
    end_frame: "First + last frames",
    reference_videos: "Reference video",
    audio_output: "With sound",
    "4k": "4K",
};
const image4KDimensions = { width: "3840", height: "2160" };
const uploadLimitsMiB = { image: 5, video: 20, audio: 20, stemSeparation: 50 };

const imageFilterOptions = ["All", ...Object.values(imageFilters)];
const audioFilters = ["All", ...new Set(Object.values(audioTaskGroups))];

function audioGroupForModel(model: PlaygroundModel) {
    const task = audioTaskForModel(model);
    if (!task) return undefined;
    const override = playgroundModelOverride(model.id);
    return (
        (override?.audioTask === task && override.audioGroup) ||
        audioTaskGroups[task]
    );
}

function acceptsFramePair(model: PlaygroundModel) {
    return (
        model.inputModalities.includes("image") &&
        (model.maxReferenceImages ?? 0) >= 2 &&
        model.videoCapabilities.includes("start_frame") &&
        model.videoCapabilities.includes("end_frame")
    );
}

function matchesModelFilter(model: PlaygroundModel, filter: string) {
    if (filter === "All") return true;
    if (model.agent) return matchesAgentFilter(model, filter);
    if (model.category === "audio") return audioGroupForModel(model) === filter;
    if (model.category === "video") {
        if (filter === videoFilters.end_frame) return acceptsFramePair(model);
        if (filter === videoFilters["4k"])
            return model.resolutions.some(
                (size) => size.toLowerCase() === "4k",
            );
        if (filter === videoFilters.reference_videos)
            return model.videoCapabilities.includes("reference_videos");
        if (filter === videoFilters.audio_output)
            return model.videoCapabilities.includes("audio_output");
        return false;
    }
    switch (filter) {
        case imageFilters.edit:
            return (
                model.inputModalities.includes("image") &&
                (model.maxReferenceImages ?? 0) > 0
            );
        case imageFilters.gif:
            return !!model.outputFormats?.gif;
        case imageFilters.svg:
            return model.outputFormats?.svg?.mode === "native";
        case imageFilters["4k"]:
            return model.resolutions.length
                ? model.resolutions.some((size) => size.toLowerCase() === "4k")
                : !!playgroundModelOverride(model.id)?.supports4K;
    }
}

function estimatePerDollar(model: PlaygroundModel, medianCost?: number | null) {
    const count = calculatePerPollen({
        realAvgCost: medianCost,
        free: model.free,
    });
    if (count === "—") return undefined;
    if (count === "∞") return "Free";
    return `${count === "<1" ? "" : "≈"}${count} gen/$1`;
}

function ModelPicker({
    models,
    stats,
    costByModel,
    selectedModel,
    isLoading,
    onSelectModel,
    details,
}: {
    /** The selected model's description and badges, shown under the selector, in line with its name. */
    details?: ReactNode;
    models: PlaygroundModel[];
    stats: ModelRunStat[];
    costByModel: ReadonlyMap<string, number | null | undefined>;
    selectedModel: string;
    isLoading: boolean;
    onSelectModel: (model: PlaygroundModel, filter?: string) => void;
}) {
    const [filter, setFilter] = useState("All");
    const modelMenu = useRef<HTMLDivElement>(null);
    const category = models[0]?.category;
    const imageModels = category === "image";
    const fastModels = useMemo(() => {
        const ids = new Set(models.map((model) => model.id));
        const measured = stats.filter((stat) => ids.has(stat.model));
        return fastModelsByTime(measured);
    }, [models, stats]);
    function matches(model: PlaygroundModel, value: string) {
        if (value === "Fast") return fastModels.has(model.id);
        return matchesModelFilter(model, value);
    }
    const filterOptions = models[0]?.agent
        ? agentFilters
        : category === "video"
          ? ["All", ...Object.values(videoFilters)]
          : imageModels
            ? imageFilterOptions
            : category === "audio"
              ? audioFilters
              : [];
    const [questOnly, setQuestOnly] = useState(false);
    const eligibleModels = questOnly
        ? models.filter((model) => !model.paidOnly)
        : models;
    const filters = [
        "All",
        "Fast",
        ...filterOptions.filter((value) => value !== "All"),
    ].filter((value) => models.some((model) => matches(model, value)));
    const activeFilter = filters.includes(filter) ? filter : "All";
    const visible = eligibleModels.filter((model) =>
        matches(model, activeFilter),
    );
    const swipeStart = useRef<{ x: number; y: number } | null>(null);
    const swiped = useRef(false);
    const index = models.findIndex((model) => model.id === selectedModel);
    const selected = models[index];
    const canStep = !isLoading && index >= 0 && models.length > 1;

    function step(direction: number) {
        const next = (index + direction + models.length) % models.length;
        onSelectModel(models[next]);
    }

    function stepButton(direction: -1 | 1) {
        if (!canStep) return null;
        const label = direction === -1 ? "Previous model" : "Next model";
        return (
            <Button
                size="icon"
                intent="neutral"
                className="hidden shrink-0 @min-[28rem]:inline-flex"
                aria-label={label}
                title={label}
                onClick={() => step(direction)}
            >
                <ChevronIcon
                    className={direction === -1 ? "rotate-90" : "-rotate-90"}
                />
            </Button>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                    <Dropdown
                        portalled={false}
                        onOpenChange={(open) => {
                            if (!open) {
                                setFilter("All");
                                setQuestOnly(false);
                            }
                        }}
                        className="w-[var(--reference-width)] overscroll-y-contain rounded-card! bg-[linear-gradient(var(--polli-color-bg-subtle),var(--polli-color-bg-subtle)),linear-gradient(var(--polli-color-surface-block),var(--polli-color-surface-block))]! p-2"
                        trigger={(open) => (
                            <Button
                                type="button"
                                intent="neutral"
                                size="lg"
                                disabled={isLoading || models.length === 0}
                                className="w-full touch-pan-y justify-between gap-2 px-5 text-lg font-semibold"
                                title={selected?.title}
                                aria-label={`Model: ${selected?.title ?? (models.length ? "Choose a model" : "Unavailable")}`}
                                aria-description={
                                    selected &&
                                    [
                                        selected.paidOnly
                                            ? "Uses paid balance only"
                                            : "Works with any balance",
                                        selected.publisher,
                                        isNewModel(selected.addedDate)
                                            ? "New"
                                            : undefined,
                                    ]
                                        .filter(Boolean)
                                        .join(", ")
                                }
                                onPointerDown={(event) => {
                                    swiped.current = false;
                                    swipeStart.current =
                                        canStep &&
                                        event.pointerType === "touch" &&
                                        event.isPrimary
                                            ? {
                                                  x: event.clientX,
                                                  y: event.clientY,
                                              }
                                            : null;
                                }}
                                onPointerCancel={() => {
                                    swipeStart.current = null;
                                }}
                                onPointerUp={(event) => {
                                    const start = swipeStart.current;
                                    swipeStart.current = null;
                                    if (!start || !canStep) return;
                                    const dx = event.clientX - start.x;
                                    if (
                                        Math.abs(dx) < 40 ||
                                        Math.abs(dx) <=
                                            Math.abs(event.clientY - start.y)
                                    )
                                        return;
                                    swiped.current = true;
                                    step(dx < 0 ? 1 : -1);
                                }}
                                onClickCapture={(event) => {
                                    if (swiped.current && event.detail > 0) {
                                        event.preventDefault();
                                        event.stopPropagation();
                                    }
                                    swiped.current = false;
                                }}
                            >
                                <span
                                    className="flex min-w-0 flex-1 text-left"
                                    aria-live="polite"
                                >
                                    {isLoading ? (
                                        "Loading models…"
                                    ) : selected ? (
                                        <MediaModelOption
                                            model={selected}
                                            iconClassName="size-6"
                                            showPricing={false}
                                        />
                                    ) : models.length ? (
                                        "Choose a model"
                                    ) : (
                                        "No models available"
                                    )}
                                </span>
                                <ChevronIcon expanded={open} />
                            </Button>
                        )}
                    >
                        {(close) => (
                            <ScrollArea
                                ref={modelMenu}
                                className="max-h-[min(26rem,60dvh)] overscroll-y-contain"
                            >
                                {filters.length > 1 && (
                                    <fieldset
                                        aria-label={`Filter ${category} models`}
                                        className="sticky top-0 z-10 mb-1 flex flex-wrap gap-1 border-b border-theme-text-muted/20 bg-[linear-gradient(var(--polli-color-bg-subtle),var(--polli-color-bg-subtle)),linear-gradient(var(--polli-color-surface-block),var(--polli-color-surface-block))] pt-1 pr-px pb-2 pl-1"
                                    >
                                        {filters.map((value) => (
                                            <TabButton
                                                key={value}
                                                active={value === activeFilter}
                                                title={
                                                    value === "Fast"
                                                        ? "Fastest quarter by measured response time"
                                                        : undefined
                                                }
                                                className="max-sm:px-2 max-sm:text-xs"
                                                size="sm"
                                                disabled={
                                                    questOnly &&
                                                    !eligibleModels.some(
                                                        (model) =>
                                                            matches(
                                                                model,
                                                                value,
                                                            ),
                                                    )
                                                }
                                                onClick={() => {
                                                    setFilter(value);
                                                    modelMenu.current?.scrollTo(
                                                        0,
                                                        0,
                                                    );
                                                }}
                                            >
                                                {value}
                                            </TabButton>
                                        ))}
                                        <TabButton
                                            active={questOnly}
                                            size="sm"
                                            intent="green"
                                            ariaLabel="Quests"
                                            className="ml-auto size-9 shrink-0 p-0"
                                            title="Show models that accept Quest balance"
                                            disabled={
                                                !questOnly &&
                                                !visible.some(
                                                    (model) => !model.paidOnly,
                                                )
                                            }
                                            onClick={() => {
                                                setQuestOnly(!questOnly);
                                                modelMenu.current?.scrollTo(
                                                    0,
                                                    0,
                                                );
                                            }}
                                        >
                                            <WalletKindIcon
                                                kind="tier"
                                                className="size-4"
                                            />
                                        </TabButton>
                                    </fieldset>
                                )}
                                <div className="flex flex-col gap-1">
                                    {visible.map((model, index) => (
                                        <Fragment key={model.id}>
                                            {isCommunityRun(model) &&
                                                !(
                                                    index > 0 &&
                                                    isCommunityRun(
                                                        visible[index - 1],
                                                    )
                                                ) && (
                                                    <p className="flex items-center gap-2 px-3 pt-2 pb-1 text-xs text-theme-text-muted before:h-px before:w-3 before:bg-theme-text-muted/30 after:h-px after:flex-1 after:bg-theme-text-muted/30">
                                                        Community · run by their
                                                        publishers
                                                    </p>
                                                )}
                                            <TabButton
                                                active={
                                                    model.id === selectedModel
                                                }
                                                size="sm"
                                                variant="ghost"
                                                aria-description={
                                                    model.publisher
                                                }
                                                className="play-model-option w-full justify-start pr-0 text-left"
                                                onClick={() => {
                                                    onSelectModel(
                                                        model,
                                                        activeFilter !==
                                                            "All" &&
                                                            activeFilter !==
                                                                "Fast" &&
                                                            (imageModels ||
                                                                category ===
                                                                    "video")
                                                            ? activeFilter
                                                            : undefined,
                                                    );
                                                    close();
                                                }}
                                            >
                                                <MediaModelOption
                                                    model={model}
                                                    perDollar={estimatePerDollar(
                                                        model,
                                                        costByModel.get(
                                                            model.id,
                                                        ),
                                                    )}
                                                />
                                            </TabButton>
                                        </Fragment>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </Dropdown>
                </div>
                {stepButton(-1)}
                {stepButton(1)}
            </div>
            {details && (
                // Same left edge as the model name in the trigger (its padding plus border).
                <div className="flex flex-col gap-2 px-[calc(1.25rem+1px)]">
                    {details}
                </div>
            )}
        </div>
    );
}

function RunStatBadge({
    cost,
    time,
    walletKind,
    costDetail,
    pricingHref,
}: {
    cost?: string;
    time?: string;
    walletKind: WalletKindIconProps["kind"];
    costDetail: string;
    pricingHref: string;
}) {
    const id = useId();
    const panel = useRef<HTMLDivElement>(null);
    const anchor = `--stat-${id}`;
    const hidePanel = () => panel.current?.hidePopover();

    return (
        <div
            onPointerEnter={(event) => {
                if (event.pointerType === "mouse") panel.current?.showPopover();
            }}
            onPointerLeave={(event) => {
                if (
                    event.pointerType === "mouse" &&
                    !panel.current?.contains(document.activeElement)
                ) {
                    hidePanel();
                }
            }}
        >
            <button
                type="button"
                popoverTarget={id}
                popoverTargetAction="show"
                style={{ anchorName: anchor }}
                aria-label={`Typical cost ${cost ?? "unavailable"}, typical time ${time ?? "unavailable"}`}
                className="flex cursor-help rounded-lg"
            >
                <Chip size="md" data-theme="neutral" className="tabular-nums">
                    {cost || time ? (
                        <>
                            <span className="text-theme-text-muted">
                                Typical
                            </span>{" "}
                            <span
                                className={
                                    walletKind === "paid"
                                        ? "polli-wallet-text-paid"
                                        : "polli-wallet-text-tier"
                                }
                            >
                                {cost ?? "—"}
                            </span>
                            <WalletKindIcon kind={walletKind} />
                            <span
                                aria-hidden="true"
                                className="text-theme-text-muted"
                            >
                                ·
                            </span>
                            {time ?? "—"}
                        </>
                    ) : (
                        <>
                            <span className="text-theme-text-muted">
                                Measuring…
                            </span>
                            <WalletKindIcon kind={walletKind} />
                        </>
                    )}
                </Chip>
            </button>
            <div
                ref={panel}
                id={id}
                popover="auto"
                style={{ positionAnchor: anchor }}
                className="play-stat-popover w-64 max-w-[calc(100vw-1.5rem)] space-y-2 rounded-lg bg-surface-menu px-3 py-2 text-xs text-theme-text-base shadow-lg"
            >
                <p>
                    <strong>Cost.</strong>{" "}
                    {cost ? costDetail : "No estimate available yet."}{" "}
                    <InlineLink
                        href={pricingHref}
                        tone="quiet"
                        style={{ fontWeight: "inherit" }}
                    >
                        Pricing
                    </InlineLink>
                </p>
                <p>
                    <strong>Time.</strong>{" "}
                    {time
                        ? "Average time to complete a successful request over the last 7 days."
                        : "No estimate available yet."}{" "}
                    <InlineLink
                        href="https://model-monitor.pollinations.ai"
                        onBlur={hidePanel}
                        tone="quiet"
                        style={{ fontWeight: "inherit" }}
                    >
                        Model Monitor
                    </InlineLink>
                </p>
            </div>
        </div>
    );
}

/** Results are local blob or data URLs, so a plain download link works. */
function ResultDownloadButton({
    result,
    className,
}: {
    result: MediaResult;
    className?: string;
}) {
    const label = `Download ${result.type === "image" ? (result.formatLabel ?? "image") : result.type}`;
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
    result: MediaResult;
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
            className="w-full max-w-3xl max-md:mx-auto"
        />
    );
}

function ResultPanel({ result }: { result: PlaygroundResult }) {
    const [expanded, setExpanded] = useState(false);

    if (result.type === "decision")
        return (
            <DecisionAnswerPanel
                answer={result.answer}
                question={result.question}
            />
        );
    const zoomButtonClass =
        "block w-full cursor-zoom-in border-0 bg-transparent p-0";

    if (result.type === "file") {
        return (
            <Alert intent="advisory">
                {result.notice}{" "}
                <InlineLink href={result.url} download={result.filename}>
                    Download original file
                </InlineLink>
            </Alert>
        );
    }
    if (result.type === "stems") {
        return (
            <Surface
                variant="card"
                className="flex items-center justify-between gap-3"
            >
                <Text>Separated stems (ZIP)</Text>
                <ResultDownloadButton result={result} />
            </Surface>
        );
    }
    if (result.type === "audio") {
        return (
            <Surface variant="card" className="flex items-center gap-3">
                {/* biome-ignore lint/a11y/useMediaCaption: Generated audio has no timed caption file; an empty track creates a broken native menu. */}
                <audio
                    src={result.url}
                    controls
                    controlsList="nodownload noplaybackrate"
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
                <div className="relative w-fit max-w-full overflow-hidden rounded-card bg-surface-opaque text-theme-text-strong max-md:mx-auto">
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

export function Playground({ drafts }: { drafts: ConnectDrafts }) {
    const dimensionsLabelId = useId();
    const { apiKey, isLoggedIn, isHydrated, error: authError } = useAuthState();
    const { login } = useAuthActions();
    const session = useMemo(
        () =>
            apiKey
                ? {
                      client: new Pollinations({
                          apiKey,
                          baseUrl: API_BASE_URL,
                      }),
                      referenceUrls: new WeakMap() as ReferenceUploads,
                  }
                : null,
        [apiKey],
    );
    const catalog = useModelCatalog({
        baseUrl: API_BASE_URL,
        enabled: isHydrated,
    });
    const { isLoading, error: catalogError } = catalog;
    const urlSearch = useSearch({ from: "/play" });
    const navigate = useNavigate({ from: "/play" });
    // A URL with Play keys wins; a bare /play restores the last inputs.
    const [params, setParams] = useState<PlaySearch>(() =>
        PLAY_SEARCH_KEYS.some((key) => urlSearch[key] !== undefined)
            ? Object.fromEntries(
                  PLAY_SEARCH_KEYS.map((key) => [key, urlSearch[key]]),
              )
            : (lastInputs ?? {}),
    );
    const legacyGif =
        params.task === "gif" || (!params.task && params.tab === "gif");
    const task =
        TASKS.find((item) => item.id === (legacyGif ? "image" : params.task)) ??
        TASKS.find(
            (item) =>
                item.workspace.category === params.tab ||
                item.id === params.tab,
        ) ??
        TASKS[0];
    const isDecide = task.id === "decide";
    const isAgent = task.id === "agent";
    const activeCategory = task.workspace.category;
    const lastTask = useRef(new Map<Workspace, Task>());
    const taskDrafts = useRef(drafts);
    const savedDraft = drafts[task.id];
    const restored =
        savedDraft?.params.model === params.model ? savedDraft : undefined;
    const {
        model: selectedModel = "",
        prompt = isDecide ? URGENCY_EXAMPLE : "",
        size: selectedResolution = "",
        width = "",
        height = "",
        aspect: aspectRatio = "",
        length: audioLength = "",
        language = "",
        seed = "",
        voice = "",
        sound = "",
    } = params;
    const duration = Number(params.duration) || 0;
    function setParam(key: keyof PlaySearch, value: string) {
        setParams((previous) => ({ ...previous, [key]: value }));
    }
    const [referenceImages, setReferenceImages] = useState<File[]>(
        restored?.referenceImages ?? [],
    );
    const [referenceQueue, setReferenceQueue] = useState<VideoReference[]>(
        restored?.videoReferences ?? [],
    );
    const videoReferences = useMemo(() => {
        const grouped: Record<UploadMedia, File[]> = {
            image: [],
            video: [],
            audio: [],
        };
        for (const { media, file } of referenceQueue) grouped[media].push(file);
        return grouped;
    }, [referenceQueue]);
    const [recordingAudio, setRecordingAudio] = useState(false);
    const [recordingVideo, setRecordingVideo] = useState(false);
    const recording = recordingAudio || recordingVideo;
    const [audioFiles, setAudioFiles] = useState<File[]>(
        restored?.audioFiles ?? [],
    );
    const linkedModelRef = useRef(selectedModel);
    const { runStore } = task;
    const { result, running, error } = useSyncExternalStore(
        runStore.subscribe,
        runStore.get,
    );
    const isGenerating = running !== null;
    const [stats, setStats] = useState<ModelRunStat[]>();
    const responseRef = useRef<HTMLDivElement>(null);
    const statusId = useId();
    const clipStatusId = useId();
    // Shared FileUpload limits and rejection messages for these media.
    const uploadProps = (
        media: UploadMedia[],
        tooMany: string,
        maxMb = Math.max(...media.map((item) => uploadLimitsMiB[item])),
    ) => {
        const messages = {
            size: `Each file must be under ${maxMb} MB.`,
            count: tooMany,
            type: `Only ${media.join(" or ")} files are allowed.`,
        };
        const onReject: FileUploadProps["onReject"] = (rejected) =>
            runStore.set({ error: messages[rejected[0].reason] });
        return {
            inputLabel: `Choose ${media.join(" or ")} file`,
            tileModality: media.length === 1 ? media[0] : ("mixed" as const),
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
                            values.task === "decide" &&
                            [
                                "prompt",
                                "question",
                                "choices",
                                "levels",
                            ].includes(key)
                                ? values[key]
                                : values[key] || undefined,
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
    // Agents are the exception: they are all community models.
    const visibleModels = useMemo(
        () =>
            catalog.models
                .filter(
                    (model) =>
                        (!model.community || model.agent) &&
                        model.health?.status !== "down",
                )
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
        () =>
            visibleModels.find(
                (model) =>
                    model.id === selectedModel && supportsTask(model, task),
            ),
        [visibleModels, selectedModel, task],
    );
    const decision =
        isDecide && currentModel
            ? decisionForm(currentModel.id, params)
            : undefined;
    const decisionRequest =
        decision?.question && currentModel && prompt.trim()
            ? {
                  model: currentModel.id,
                  state: prompt.trim(),
                  questions: { decision: decision.question },
              }
            : undefined;
    const audioTask =
        currentModel?.category === "audio"
            ? audioTaskForModel(currentModel)
            : undefined;

    const costByModel = useMemo(
        () => new Map(stats?.map((stat) => [stat.model, stat.avg_cost_usd])),
        [stats],
    );
    const pickerModels = useMemo(() => {
        const tasks = TASKS.filter((item) => item.workspace === task.workspace);
        const price = (model: PlaygroundModel) =>
            typicalRequestCost({
                realAvgCost: costByModel.get(model.id),
                free: model.free,
            }) ?? -1;
        return visibleModels
            .filter((model) => tasks.some((item) => supportsTask(model, item)))
            .sort((a, b) => {
                const community =
                    Number(isCommunityRun(a)) - Number(isCommunityRun(b));
                if (community) return community;
                const aNew = isNewModel(a.addedDate);
                const bNew = isNewModel(b.addedDate);
                if (aNew !== bNew) return aNew ? -1 : 1;
                const priceOrder = price(b) - price(a);
                if (priceOrder) return priceOrder;
                return a.title.localeCompare(b.title, "en", {
                    numeric: true,
                    sensitivity: "base",
                });
            });
    }, [task.workspace, visibleModels, costByModel]);
    // Picks the model for the open tab. One effect, so a linked ?model= and
    // the tab default never race on the same render. A link opens that
    // model's tab; older links use an alias, such as ?model=flux.
    useEffect(() => {
        if (!isHydrated || isLoading || catalogError) return;
        if (visibleModels.length === 0) return;
        const linked = legacyGif ? selectedModel : linkedModelRef.current;
        linkedModelRef.current = "";
        const linkedModel = visibleModels.find(
            (model) =>
                !!linked &&
                (model.id === linked || model.aliases.includes(linked)),
        );
        if (legacyGif) {
            const image =
                linkedModel?.category === "image" ? linkedModel : undefined;
            const model =
                image ??
                visibleModels.find(
                    (model) =>
                        model.category === "image" &&
                        (model.outputFormats?.gif ||
                            model.outputFormats?.svg?.mode === "native"),
                ) ??
                visibleModels.find((model) => model.category === "image");
            setParams((previous) => ({
                ...previous,
                task: "image",
                tab: "image",
                model: model?.id,
                format:
                    model?.outputFormats?.gif?.mode === "selectable"
                        ? "gif"
                        : undefined,
            }));
            return;
        }
        if (linkedModel) {
            const linkedTask = supportsTask(linkedModel, task)
                ? task
                : TASKS.find((item) => supportsTask(linkedModel, item));
            if (linkedTask) {
                setParams((previous) => ({
                    ...previous,
                    task: linkedTask.id,
                    model: linkedModel.id,
                }));
                return;
            }
        }
        if (selectedModel || !stats) return;
        const usable = pickerModels.filter(
            (model) =>
                (!isLoggedIn || catalog.allowedModelIds.has(model.id)) &&
                (!params.task || supportsTask(model, task)),
        );
        const first =
            usable.find((model) => model.id === DEFAULT_AGENT_ID) ?? usable[0];
        if (first) {
            setParams((previous) => ({
                ...previous,
                model: first.id,
                task:
                    first.category === "audio"
                        ? audioTaskForModel(first)
                        : task.id,
            }));
        }
    }, [
        task,
        params.task,
        legacyGif,
        isLoggedIn,
        catalog.allowedModelIds,
        selectedModel,
        visibleModels,
        pickerModels,
        stats,
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
        lastInputs = { ...params, tab: activeCategory, voice: selectedVoice };
        showInUrl(lastInputs);
    }, [showInUrl, params, activeCategory, selectedVoice]);

    useEffect(() => {
        fetch(`${API_BASE_URL}/models/stats`, {
            signal: AbortSignal.timeout(5000),
        })
            .then((response) => response.json())
            .then(({ data }) => setStats(data ?? []))
            .catch(() => setStats([]));
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
    const {
        format,
        info: formatInfo,
        options: formatOptions,
        request: outputOptions,
    } = imageOutput(
        currentModel?.category === "image"
            ? currentModel.outputFormats
            : undefined,
        params.format,
    );
    const inputModalities =
        formatInfo?.input_modalities ?? currentModel?.inputModalities;
    const maxReferenceImages = inputModalities?.includes("image")
        ? (currentModel?.maxReferenceImages ?? 0)
        : 0;
    const supportsReferenceImages = maxReferenceImages > 0;
    const supportsFrames =
        currentModel?.category === "video" &&
        currentModel.videoCapabilities.includes("start_frame") &&
        supportsReferenceImages;
    const isReferenceImageListMode =
        supportsReferenceImages && currentModel?.category === "image";
    const acceptsImageParam = supportsFrames || isReferenceImageListMode;
    const supportsLastFrame =
        currentModel?.category === "video" && acceptsFramePair(currentModel);
    const currentAudioEndpoint =
        currentModel?.category === "audio"
            ? audioEndpoint(currentModel)
            : undefined;
    const isStemSeparation =
        currentAudioEndpoint === "/alpha/audio/stem-separation";
    const stemVariationId =
        params.stems === "2" ? "two_stems_v1" : "six_stems_v1";
    const isAudioTranscription =
        currentAudioEndpoint === "/v1/audio/transcriptions";
    const transcription =
        isAudioTranscription && currentModel
            ? transcriptionControls(currentModel)
            : undefined;
    const showsAudioLength =
        currentModel &&
        audioTask === "music-and-sound-effects" &&
        supportsAudioLength(currentModel);
    const audioDuration = showsAudioLength
        ? Number(audioLength) || undefined
        : undefined;
    const audioRequestError =
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
        !isAgent &&
        (formatInfo
            ? formatInfo.input_modalities.includes("text")
            : currentModel?.category !== "audio" ||
              (transcription?.prompt ??
                  currentModel.inputModalities.includes("text")));
    const agentChat = useAgentChat(
        isAgent ? currentModel?.id : undefined,
        async (file) => {
            if (!session) throw new Error("Connect to attach images.");
            return uploadReference(session.client, file, session.referenceUrls);
        },
        isAgent && !!currentModel && takesFileLinks(currentModel),
    );
    const promptLabel = isAgent
        ? "Message"
        : isDecide
          ? "Context"
          : isAudioTranscription
            ? "Instructions"
            : "Description";
    const selectedModelAllowed =
        !!currentModel &&
        isLoggedIn &&
        catalog.allowedModelIds.has(currentModel.id);
    const videoReferenceMedia =
        currentModel?.category === "video"
            ? UPLOAD_MEDIA_ORDER.filter((media) =>
                  currentModel.videoCapabilities.includes(
                      REFERENCE_CAPABILITY[media],
                  ),
              )
            : [];
    // An agent takes audio and video links like the Video tab's references.
    const agentKinds =
        isAgent && currentModel ? agentAttachments(currentModel) : [];
    const queueMedia = isAgent
        ? UPLOAD_MEDIA_ORDER.filter(
              (media) => media !== "image" && agentKinds.includes(media),
          )
        : videoReferenceMedia;
    const hasReferenceMedia = videoReferenceMedia.some(
        (media) => videoReferences[media].length > 0,
    );
    const framesDisabled =
        videoConfig.exclusiveReferences && (hasReferenceMedia || recording);
    const mediaDisabled =
        videoConfig.exclusiveReferences &&
        supportsFrames &&
        referenceImages.length > 0;
    const modelOverride = playgroundModelOverride(currentModel?.id ?? "");
    const mediaSettings = mediaModelSettings(currentModel, {
        resolution: selectedResolution,
        duration,
        durationLimit: hasReferenceMedia
            ? modelOverride?.maxDurationWithReference
            : undefined,
    });
    const selectedAudioClips =
        currentModel?.category === "video" ? videoReferences.audio : audioFiles;
    const [clipDurations, setClipDurations] = useState(
        () => new Map<File, number | null>(),
    );
    useEffect(() => {
        setClipDurations(
            (previous) =>
                new Map(
                    [...previous].filter(([file]) =>
                        selectedAudioClips.includes(file),
                    ),
                ),
        );
    }, [selectedAudioClips]);
    const rememberClipDuration = useCallback(
        (file: File, seconds: number | null) => {
            setClipDurations((previous) =>
                previous.get(file) === seconds
                    ? previous
                    : new Map(previous).set(file, seconds),
            );
        },
        [],
    );
    const inputConstraints = currentModel?.audioInputConstraints;
    const onClipDuration =
        inputConstraints?.min_seconds ||
        inputConstraints?.max_seconds ||
        inputConstraints?.max_total_seconds
            ? rememberClipDuration
            : undefined;
    const clipError =
        currentModel?.category === "audio" ||
        videoReferenceMedia.includes("audio")
            ? audioConstraintError(
                  inputConstraints,
                  selectedAudioClips,
                  clipDurations,
                  videoReferences.image.length + videoReferences.video.length >
                      0,
              )
            : null;
    const inputError = decision?.error ?? clipError ?? audioRequestError;
    // An input image or video fixes the output shape, so Auto follows it;
    // otherwise Auto may render square and the default ratio applies.
    const sendsVisualInput =
        (acceptsImageParam && referenceImages.length > 0) ||
        videoReferenceMedia.some(
            (media) => media !== "audio" && videoReferences[media].length > 0,
        );
    // "" is not picked yet; an explicit Auto is stored as "auto".
    const pickedRatio = aspectRatio === "auto" ? "" : aspectRatio;
    const defaultVideoRatio = sendsVisualInput
        ? videoConfig.ratios[0]
        : videoConfig.defaultRatio;
    const videoAspectRatio =
        currentModel?.category === "video"
            ? aspectRatio && videoConfig.ratios.includes(pickedRatio)
                ? pickedRatio
                : defaultVideoRatio
            : undefined;
    const autoVideoDuration =
        modelOverride?.autoDurationWithReferenceVideo &&
        videoReferenceMedia.includes("video") &&
        videoReferences.video.length > 0 &&
        (!videoAspectRatio || videoAspectRatio === "adaptive");
    const videoDuration =
        currentModel?.category === "video" && !autoVideoDuration
            ? mediaSettings.duration
            : undefined;
    const isVisualModel =
        currentModel?.category === "image" ||
        currentModel?.category === "video";
    // Few image models declare resolutions, but /image accepts width and
    // height for all of them. Blank keeps the model's default size.
    const customSize =
        format !== "gif" &&
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
    // A speech reference travels in the POST body.
    const audioGet =
        currentModel?.supportedEndpoints.includes("/audio/{text}") &&
        audioFiles.length === 0;
    const apiMethod = isVisualModel || audioGet ? "GET" : "POST";
    const apiFields: Record<string, unknown> | undefined =
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
                  ...(isStemSeparation
                      ? { stem_variation_id: stemVariationId }
                      : {}),
                  ...(transcription?.language && language.trim()
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
            : isAgent && currentModel
              ? {
                    model: currentModel.id,
                    input: prompt.trim() || "your-message-here",
                    stream: true,
                }
              : decisionRequest;
    const postEndpoint = isAgent
        ? "/v1/responses"
        : isDecide
          ? "/alpha/decisions"
          : currentAudioEndpoint === "/audio/{text}"
            ? "/v1/audio/speech"
            : currentAudioEndpoint;
    const apiUrl = currentModel
        ? apiMethod === "POST"
            ? `${API_BASE_URL}${postEndpoint}`
            : `${API_BASE_URL}/${currentModel.category}/${encodeURIComponent(
                  prompt.trim() || "your-prompt-here",
              )}?${new URLSearchParams(
                  Object.entries({
                      model: currentModel.id,
                      ...(isVisualModel
                          ? {
                                ...imageSize,
                                output_format: outputOptions?.outputFormat,
                                frame_count: outputOptions?.frameCount,
                                frame_duration_ms:
                                    outputOptions?.frameDurationMs,
                                resolution: mediaSettings.resolution,
                                aspectRatio: videoAspectRatio,
                                duration: videoDuration?.value,
                                seed: fixedSeed,
                                image: acceptsImageParam
                                    ? exampleReferenceUrls(
                                          "image",
                                          referenceImages,
                                      )
                                    : undefined,
                                ...Object.fromEntries(
                                    videoReferenceMedia.map((media) => [
                                        REFERENCE_CAPABILITY[media],
                                        exampleReferenceUrls(
                                            media,
                                            videoReferences[media],
                                        ),
                                    ]),
                                ),
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
        if (!currentModel) return;
        // Keep still-image references when a different output mode hides them.
        const limit = currentModel.maxReferenceImages ?? 0;
        setReferenceImages((current) => {
            if (current.length <= limit) return current;
            return current.slice(0, limit);
        });
    }, [currentModel]);

    function selectTask(next: Task, modelId?: string) {
        if (next === task) return;
        lastTask.current.set(task.workspace, task);
        taskDrafts.current[task.id] = {
            params,
            referenceImages,
            videoReferences: referenceQueue,
            audioFiles,
        };
        const draft = taskDrafts.current[next.id];
        const saved =
            !modelId || draft?.params.model === modelId ? draft : undefined;
        linkedModelRef.current = "";
        setParams({
            ...(saved?.params ?? { model: modelId }),
            task: saved || modelId ? next.id : undefined,
            tab: next.workspace.category,
        });
        setReferenceImages(saved?.referenceImages ?? []);
        setReferenceQueue(saved?.videoReferences ?? []);
        setAudioFiles(saved?.audioFiles ?? []);
    }

    function selectModel(model: PlaygroundModel, filter?: string) {
        const outputFormat =
            filter === imageFilters.gif
                ? "gif"
                : filter === imageFilters.svg
                  ? "svg"
                  : undefined;
        const selection: PlaySearch = { format: outputFormat };
        if (
            model.category === "video" &&
            filter === videoFilters.audio_output &&
            videoOptions(model.id, model.videoCapabilities).sound === "optional"
        )
            selection.sound = "on";
        if (
            filter ===
            (model.category === "video"
                ? videoFilters["4k"]
                : imageFilters["4k"])
        ) {
            const size = model.resolutions.find(
                (size) => size.toLowerCase() === "4k",
            );
            if (size) selection.size = size;
            else if (model.category === "image") {
                Object.assign(selection, image4KDimensions);
            }
        }
        const modelId = model.id;
        if (modelId === selectedModel) {
            if (filter)
                setParams((previous) => ({ ...previous, ...selection }));
            return;
        }
        if (!supportsTask(model, task)) {
            const next = TASKS.find(
                (item) =>
                    item.workspace === task.workspace &&
                    supportsTask(model, item),
            );
            if (next) selectTask(next, modelId);
            return;
        }
        setParams((previous) => ({
            ...previous,
            model: modelId,
            width: undefined,
            height: undefined,
            size: undefined,
            duration: undefined,
            sound: undefined,
            ...selection,
        }));
        setAudioFiles([]);
        setReferenceQueue([]);
    }

    function videoUploadProps(media: UploadMedia) {
        const maxVideos =
            media === "video" ? currentModel?.maxReferenceVideos : undefined;
        const value = videoReferences[media];
        return {
            ...uploadProps(
                [media],
                media === "audio"
                    ? "Too many audio clips."
                    : maxVideos
                      ? `Use up to ${maxVideos === 1 ? "1 video" : `${maxVideos} videos`}.`
                      : "Too many files.",
            ),
            value,
            maxFiles:
                (media === "audio"
                    ? currentModel?.maxReferenceAudios
                    : maxVideos) ?? Infinity,
            onChange(files: File[]) {
                const added = files
                    .slice(value.length)
                    .map((file) => ({ id: crypto.randomUUID(), media, file }));
                setReferenceQueue((previous) => [...previous, ...added]);
            },
        };
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

        if (isGenerating || !session || !currentModel || blockedReason) return;

        runStore.set({ running: activeCategory, error: null, result: null });

        try {
            const { client } = session;
            if (decisionRequest) {
                const { answers } = await client.decision(decisionRequest);
                const answer = answers.decision;
                if (answer?.type !== decisionRequest.questions.decision.type)
                    throw new Error("The model returned an unexpected answer.");
                runStore.set({
                    result: {
                        type: "decision",
                        answer,
                        question:
                            decisionRequest.questions.decision.instructions,
                    },
                });
                return;
            }
            const uploadFiles = (files: File[]) =>
                Promise.all(
                    files.map((file) =>
                        uploadReference(client, file, session.referenceUrls),
                    ),
                );
            const requestSeed = fixedSeed ?? randomGenerationSeed();
            const referenceUrls = acceptsImageParam
                ? await uploadFiles(referenceImages)
                : [];

            if (currentModel.category === "video") {
                const [images, videos, audios] = await Promise.all(
                    UPLOAD_MEDIA_ORDER.map((media) =>
                        videoReferenceMedia.includes(media)
                            ? uploadFiles(videoReferences[media])
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
                    ...outputOptions,
                    resolution: mediaSettings.resolution,
                    seed: requestSeed,
                    referenceImage:
                        referenceUrls.length > 0 ? referenceUrls : undefined,
                });
                runStore.set({
                    result: imageResult(
                        response,
                        formatInfo?.mode === "default" ? undefined : format,
                    ),
                });
                return;
            }

            if (currentModel.category === "audio") {
                const response = await generatePlaygroundAudio(
                    client,
                    currentModel,
                    {
                        prompt: trimmedPrompt,
                        file: audioFiles[0],
                        referenceUrls: session.referenceUrls,
                        voice: selectedVoice || undefined,
                        duration: audioDuration,
                        language,
                        stemVariationId: isStemSeparation
                            ? stemVariationId
                            : undefined,
                    },
                );
                runStore.set({
                    result:
                        response.type === "text"
                            ? response
                            : response.type === "stems"
                              ? {
                                    type: "stems",
                                    url: URL.createObjectURL(response.archive),
                                    filename: "stems.zip",
                                }
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

    const requiresImage =
        format !== "gif" &&
        currentModel?.category === "image" &&
        ((modelOverride?.requiresImage && inputModalities?.includes("image")) ||
            (currentModel.supportedEndpoints.includes("/v1/images/edits") &&
                !currentModel.supportedEndpoints.includes(
                    "/v1/images/generations",
                )));
    const editsImage =
        currentModel?.category === "image" &&
        (requiresImage || (acceptsImageParam && referenceImages.length > 0));
    const generateLabel = isAgent
        ? "Send"
        : isDecide
          ? "Evaluate"
          : currentModel?.category === "video"
            ? "Generate video"
            : currentModel?.category === "audio"
              ? isAudioTranscription
                  ? "Transcribe audio"
                  : currentAudioEndpoint === "/v1/audio/voice-changer"
                    ? "Change voice"
                    : currentAudioEndpoint === "/v1/audio/voice-isolator"
                      ? "Isolate speech"
                      : currentAudioEndpoint === "/alpha/audio/stem-separation"
                        ? "Separate stems"
                        : "Generate audio"
              : imageActionLabel(editsImage, format);
    const GenerateIcon =
        isAgent && agentChat.busy ? XIcon : task.workspace.icon;
    const busyLabel = isDecide
        ? "Evaluating…"
        : isAudioTranscription
          ? "Transcribing…"
          : "Generating…";
    // The placeholder belongs to the tab whose run is in flight; audio has none.
    const busyVisual =
        running === "image" || running === "video" ? running : null;

    const againLabel = generateLabel.startsWith("Generate ")
        ? "Generate again"
        : generateLabel;
    const generateText = isAgent ? (
        <StableLabel
            text={agentChat.busy ? "Stop" : "Send"}
            options={["Send", "Stop"]}
        />
    ) : (
        <StableLabel
            text={
                isGenerating ? busyLabel : result ? againLabel : generateLabel
            }
            options={[generateLabel, againLabel, busyLabel]}
        />
    );
    const connectLabel = `Connect to ${generateLabel[0].toLowerCase()}${generateLabel.slice(1)}`;

    // Signed out is a step, not a fault — handled by the button itself.
    const needsSignIn = isHydrated && !apiKey;
    const needsEditImage = requiresImage && referenceImages.length === 0;
    const missingInput = isAgent
        ? !agentChat.busy &&
          !prompt.trim() &&
          referenceImages.length === 0 &&
          referenceQueue.length === 0
        : requiresMediaUpload
          ? audioFiles.length === 0
          : !prompt.trim();

    /** Why the button cannot fire, or null when it can. Shown beside the button. */
    const blockedReason = recording
        ? "Finish recording first"
        : needsSignIn
          ? null
          : inputError
            ? inputError
            : needsEditImage
              ? "Add an image to edit"
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
    async function connect() {
        if (recording) {
            runStore.set({ error: "Finish recording before connecting." });
            return;
        }
        const saved = {
            ...taskDrafts.current,
            [task.id]: {
                params,
                referenceImages,
                videoReferences: referenceQueue,
                audioFiles,
            },
        };
        try {
            if (
                Object.values(saved).some(
                    (draft) =>
                        draft.referenceImages.length ||
                        draft.audioFiles.length ||
                        draft.videoReferences.length,
                )
            ) {
                await saveConnectDraft(saved);
            }
            login();
        } catch {
            runStore.set({
                error: "Couldn’t save your files for sign-in. Free up browser storage or remove the files and try again.",
            });
        }
    }
    function sendToAgent() {
        if (agentChat.busy) return agentChat.stop();
        agentChat.send(prompt.trim(), [
            ...(agentKinds.includes("image") ? referenceImages : []),
            ...referenceQueue.map(({ file }) => file),
        ]);
        setParam("prompt", "");
        setReferenceImages([]);
        setReferenceQueue([]);
    }
    const run = needsSignIn ? connect : isAgent ? sendToAgent : generate;
    const modelStats = stats?.find((stat) => stat.model === currentModel?.id);
    const cost =
        formatRunCost(modelStats?.avg_cost_usd) ??
        (currentModel?.free ? "Free" : undefined);
    const time = formatRunTime(modelStats?.avg_response_ms);

    const clipStatus = clipError && <span id={clipStatusId}>{clipError}</span>;
    const cameraTile = (maxBytes: number, onRecord: (file: File) => void) => (
        <VideoRecorder
            key={currentModel?.id}
            maxBytes={maxBytes}
            onRecord={onRecord}
            onBusyChange={setRecordingVideo}
            disabled={
                recordingAudio ||
                isGenerating ||
                mediaDisabled ||
                agentChat.busy
            }
        />
    );
    const audioUploadProps = acceptsMediaUpload
        ? uploadProps(
              uploadMedia,
              "Use one media file.",
              isStemSeparation ? uploadLimitsMiB.stemSeparation : undefined,
          )
        : undefined;
    const audioInput =
        currentModel?.category === "audio" && audioUploadProps ? (
            <fieldset
                aria-label={
                    requiresMediaUpload
                        ? `${mediaUploadLabel} input`
                        : "Reference media"
                }
                className="flex min-w-0 flex-col gap-2"
            >
                <div className="flex flex-wrap items-start gap-3">
                    {uploadMedia.includes("audio") ? (
                        <AudioInput
                            key={currentModel.id}
                            value={audioFiles}
                            onChange={setAudioFiles}
                            actionsOnly={audioFiles.length === 0}
                            onBusyChange={setRecordingAudio}
                            onClipDuration={onClipDuration}
                            disabled={isGenerating || recordingVideo}
                            importLabel={capitalize(mediaUploadLabel)}
                            {...audioUploadProps}
                        />
                    ) : (
                        <FileUpload
                            value={audioFiles}
                            onChange={setAudioFiles}
                            disabled={isGenerating || recordingVideo}
                            maxFiles={1}
                            {...audioUploadProps}
                            previewIcon={
                                <MediaUploadIcon className="h-5 w-5" />
                            }
                            label={capitalize(mediaUploadLabel)}
                        />
                    )}
                    {uploadMedia.includes("video") &&
                        audioFiles.length === 0 &&
                        cameraTile(audioUploadProps.maxSizeBytes, (file) =>
                            setAudioFiles([file]),
                        )}
                </div>
                {!requiresMediaUpload && audioFiles.length > 0 && (
                    <UploadPrivacyNote />
                )}
                {clipStatus && (
                    <Text size="xs" tone="muted">
                        {clipStatus}
                    </Text>
                )}
            </fieldset>
        ) : null;
    const queuedTiles = referenceQueue.map(
        (item) =>
            queueMedia.includes(item.media) && (
                <UploadedFileTile
                    key={item.id}
                    drop={videoUploadProps(item.media)}
                    file={item.file}
                    modality={item.media}
                    disabled={
                        agentChat.busy ||
                        (item.media === "audio" &&
                            (recording || isGenerating)) ||
                        (item.media === "video" && recordingVideo)
                    }
                    onClipDuration={
                        item.media === "audio" ? onClipDuration : undefined
                    }
                    onRemove={() =>
                        setReferenceQueue((previous) =>
                            previous.filter((entry) => entry !== item),
                        )
                    }
                />
            ),
    );
    const videoPicker = queueMedia.includes("video")
        ? videoUploadProps("video")
        : undefined;
    const mediaTiles = (
        <>
            {queueMedia.map((media) => {
                const props = videoUploadProps(media);
                return media === "audio" ? (
                    <AudioInput
                        key={`${currentModel?.id}-audio`}
                        actionsOnly
                        {...props}
                        onBusyChange={setRecordingAudio}
                        disabled={
                            isGenerating ||
                            recordingVideo ||
                            mediaDisabled ||
                            agentChat.busy
                        }
                    />
                ) : (
                    <FileUpload
                        key={media}
                        actionsOnly
                        {...props}
                        disabled={
                            mediaDisabled ||
                            agentChat.busy ||
                            (media === "video" && recordingVideo)
                        }
                        label={capitalize(media)}
                    />
                );
            })}
            {videoPicker &&
                videoPicker.value.length < videoPicker.maxFiles &&
                cameraTile(videoPicker.maxSizeBytes, (file) =>
                    videoPicker.onChange([...videoPicker.value, file]),
                )}
        </>
    );
    const frameTiles =
        supportsFrames &&
        (supportsLastFrame
            ? ["First frame", "Last frame"]
            : ["First frame"]
        ).map((label, index) => (
            <fieldset
                key={label}
                aria-label={label}
                className={cn(
                    "m-0 min-w-0 border-0 p-0",
                    framesDisabled && "grayscale",
                )}
            >
                <FileUpload
                    value={referenceImages.slice(index, index + 1)}
                    onChange={(files) => setFrameImage(index, files)}
                    maxFiles={1}
                    {...uploadProps(
                        ["image"],
                        `Use one image for the ${label.toLowerCase()}.`,
                    )}
                    disabled={
                        framesDisabled || (index > 0 && !referenceImages[0])
                    }
                    label={label}
                    inputLabel={`Choose ${label.toLowerCase()}`}
                />
                {referenceImages[index] && (
                    <Text size="xs" tone="muted" className="mt-1 text-center">
                        {label}
                    </Text>
                )}
            </fieldset>
        ));
    return (
        <div className="relative z-10 flex w-full flex-col pb-12 text-theme-text-base sm:pb-16">
            <div className="grid grid-cols-1 overflow-clip">
                {catalogError && (
                    <div className="pt-4">
                        <Alert intent="danger">
                            Model catalog failed to load: {catalogError.message}
                        </Alert>
                    </div>
                )}
                <div className="flex flex-col gap-4 pt-1">
                    {/* Connect sits midway between the page intro and the tabs. */}
                    <div className="mb-7 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div inert={!isHydrated}>
                            <AppUserMenu
                                connectSize="lg"
                                onConnect={connect}
                                labels={{
                                    authorize: "Connect",
                                    logout: "Disconnect app",
                                }}
                            />
                        </div>
                        {isHydrated && (
                            <Text
                                size="xs"
                                tone="muted"
                                className="min-w-0 max-w-72 flex-1 basis-44"
                            >
                                Want this button in your app? Your users pay
                                with their own balance.{" "}
                                <InlineLink href={LINKS.byopDocs} tone="quiet">
                                    How it works
                                </InlineLink>
                            </Text>
                        )}
                    </div>
                    <fieldset
                        aria-label="Playground task"
                        className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
                    >
                        {WORKSPACES.map((item) => (
                            <ModalityTab
                                key={item.label}
                                active={item === task.workspace}
                                size="lg"
                                modality={
                                    item.category === "decision"
                                        ? "text"
                                        : item.category
                                }
                                icon={item.icon}
                                onClick={() => {
                                    if (item === task.workspace) return;
                                    const next =
                                        lastTask.current.get(item) ??
                                        TASKS.find(
                                            (candidate) =>
                                                candidate.workspace === item,
                                        );
                                    if (next) selectTask(next);
                                }}
                            >
                                {item.label}
                            </ModalityTab>
                        ))}
                    </fieldset>
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
                    <section aria-label="Model" className="@container min-w-0">
                        <ModelPicker
                            key={activeCategory}
                            models={pickerModels}
                            stats={stats ?? []}
                            costByModel={costByModel}
                            selectedModel={selectedModel}
                            isLoading={isLoading || !isHydrated}
                            onSelectModel={selectModel}
                            details={
                                currentModel && (
                                    <>
                                        {currentModel.description && (
                                            <Text
                                                tone="soft"
                                                data-theme="neutral"
                                            >
                                                {currentModel.description}
                                            </Text>
                                        )}
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                            {modelAbilities(currentModel).some(
                                                (ability) =>
                                                    !ability.shownByUploads,
                                            ) && (
                                                <ul
                                                    aria-label="Abilities"
                                                    className="m-0 flex list-none flex-wrap items-center gap-2 p-0"
                                                >
                                                    {modelAbilities(
                                                        currentModel,
                                                    )
                                                        .filter(
                                                            (ability) =>
                                                                !ability.shownByUploads,
                                                        )
                                                        .map(
                                                            ({
                                                                label,
                                                                Icon,
                                                            }) => (
                                                                <li
                                                                    key={label}
                                                                    className="flex"
                                                                >
                                                                    <Chip
                                                                        size="md"
                                                                        data-theme="neutral"
                                                                        className="gap-1"
                                                                    >
                                                                        <Icon
                                                                            aria-hidden="true"
                                                                            className="size-3.5"
                                                                        />
                                                                        {label}
                                                                    </Chip>
                                                                </li>
                                                            ),
                                                        )}
                                                </ul>
                                            )}
                                            <RunStatBadge
                                                cost={cost}
                                                time={time}
                                                walletKind={
                                                    currentModel.paidOnly
                                                        ? "paid"
                                                        : "tier"
                                                }
                                                costDetail={
                                                    cost === "Free"
                                                        ? "This model is free to use."
                                                        : "Median cost of a successful paid request over the last 7 days. Your settings can change the price."
                                                }
                                                pricingHref={`${ENTER_URL}/models?${new URLSearchParams({ category: currentModel.category, q: currentModel.id })}`}
                                            />
                                        </div>
                                    </>
                                )
                            }
                        />
                    </section>
                    <Surface
                        as="section"
                        variant="card"
                        aria-label="Generation inputs"
                        className="@container/play-inputs flex flex-col gap-5"
                    >
                        <fieldset
                            aria-label="Model input"
                            className="flex min-w-0 flex-col gap-3"
                        >
                            {isAgent && currentModel && (
                                <AgentChat
                                    agentTitle={currentModel.title}
                                    turns={agentChat.turns}
                                    busy={agentChat.busy}
                                    draft={prompt}
                                    onDraftChange={(value) =>
                                        setParam("prompt", value)
                                    }
                                    onSubmit={() => {
                                        if (!blockedReason && !agentChat.busy)
                                            run();
                                    }}
                                    onRetry={agentChat.retry}
                                    onClear={agentChat.clear}
                                    renderMedia={(url) => (
                                        <AgentMedia url={url} />
                                    )}
                                    attachments={
                                        agentKinds.length > 0 && (
                                            <div className="flex flex-col gap-2">
                                                <div className="flex flex-wrap items-start gap-3">
                                                    {agentKinds.includes(
                                                        "image",
                                                    ) && (
                                                        <FileUpload
                                                            value={
                                                                referenceImages
                                                            }
                                                            onChange={
                                                                setReferenceImages
                                                            }
                                                            maxFiles={
                                                                maxReferenceImages
                                                            }
                                                            disabled={
                                                                agentChat.busy
                                                            }
                                                            {...uploadProps(
                                                                ["image"],
                                                                `Use up to ${maxReferenceImages} images.`,
                                                            )}
                                                            label="Image"
                                                        />
                                                    )}
                                                    {queuedTiles}
                                                    {mediaTiles}
                                                </div>
                                                {(referenceImages.length > 0 ||
                                                    referenceQueue.length >
                                                        0) && (
                                                    <UploadPrivacyNote />
                                                )}
                                            </div>
                                        )
                                    }
                                />
                            )}
                            {showPromptInput && (
                                <FieldStack
                                    label={isDecide ? "Context" : undefined}
                                    orientation={
                                        isDecide ? "inline" : "stacked"
                                    }
                                    className={
                                        isDecide
                                            ? "[&>div:first-child]:self-start [&>div:first-child]:pt-2"
                                            : undefined
                                    }
                                >
                                    <Textarea
                                        aria-label={
                                            isAudioTranscription
                                                ? "Instructions (optional)"
                                                : promptLabel
                                        }
                                        value={prompt}
                                        rows={
                                            isAudioTranscription || isDecide
                                                ? 3
                                                : 7
                                        }
                                        onChange={(event) =>
                                            setParam(
                                                "prompt",
                                                event.target.value,
                                            )
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
                                            task,
                                            editsImage,
                                            format,
                                        )}
                                        className={cn(
                                            !isDecide && "lg:min-h-56",
                                            isAudioTranscription || isDecide
                                                ? "min-h-24"
                                                : "min-h-44",
                                        )}
                                    />
                                </FieldStack>
                            )}
                            {decision && (
                                <>
                                    <OptionField
                                        label="Question type"
                                        options={decision.types}
                                        value={decision.type}
                                        onChange={(type) =>
                                            setParam("questionType", type)
                                        }
                                        format={questionTypeLabel}
                                    />
                                    <FieldStack
                                        label="Question"
                                        orientation="inline"
                                    >
                                        <Input
                                            aria-label="Question"
                                            value={decision.instructions}
                                            onChange={(event) =>
                                                setParam(
                                                    "question",
                                                    event.target.value,
                                                )
                                            }
                                        />
                                    </FieldStack>
                                    {(decision.type === "choice" ||
                                        decision.type === "score") && (
                                        <DecisionCriteriaFields
                                            type={decision.type}
                                            values={decision.criteria}
                                            onChange={(values) =>
                                                setParam(
                                                    decision.type === "score"
                                                        ? "levels"
                                                        : "choices",
                                                    values.join("\n"),
                                                )
                                            }
                                        />
                                    )}
                                </>
                            )}
                            {audioInput}
                            {isReferenceImageListMode && (
                                <fieldset
                                    aria-label={
                                        requiresImage
                                            ? "Required image"
                                            : "Reference images"
                                    }
                                    className="flex min-w-0 flex-col gap-2"
                                >
                                    <div className="flex flex-wrap items-end gap-2">
                                        <FileUpload
                                            value={referenceImages}
                                            onChange={setReferenceImages}
                                            maxFiles={maxReferenceImages}
                                            {...uploadProps(
                                                ["image"],
                                                `Use up to ${maxReferenceImages === 1 ? "1 image" : `${maxReferenceImages} images`}.`,
                                            )}
                                            label="Image"
                                        />
                                        {maxReferenceImages > 1 &&
                                            referenceImages.length > 0 && (
                                                <Text
                                                    size="xs"
                                                    tone="muted"
                                                    aria-label={`${referenceImages.length} of ${maxReferenceImages} reference images`}
                                                >
                                                    {referenceImages.length}/
                                                    {maxReferenceImages}
                                                </Text>
                                            )}
                                    </div>
                                    {referenceImages.length > 0 && (
                                        <UploadPrivacyNote />
                                    )}
                                </fieldset>
                            )}

                            {(supportsFrames ||
                                videoReferenceMedia.length > 0) && (
                                <fieldset
                                    aria-label="Video references"
                                    className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
                                >
                                    <div
                                        className={cn(
                                            "flex flex-wrap items-start gap-3",
                                            mediaDisabled &&
                                                "[&_button:disabled]:grayscale [&_label:has(input:disabled)]:grayscale",
                                        )}
                                    >
                                        {queuedTiles}
                                        {frameTiles}
                                        {mediaTiles}
                                    </div>
                                    {clipStatus && (
                                        <Text size="xs" tone="muted">
                                            {clipStatus}
                                        </Text>
                                    )}
                                    {((supportsFrames &&
                                        referenceImages.length > 0) ||
                                        hasReferenceMedia) && (
                                        <UploadPrivacyNote />
                                    )}
                                </fieldset>
                            )}
                        </fieldset>
                        <div className="play-parameter-grid">
                            {currentModel && currentModel.voices.length > 0 && (
                                <VoicePicker
                                    key={currentModel.id}
                                    voices={currentModel.voices}
                                    value={selectedVoice}
                                    onChange={(value) =>
                                        setParam("voice", value)
                                    }
                                />
                            )}

                            {isStemSeparation && (
                                <OptionField
                                    label="Stems"
                                    options={["2", "6"]}
                                    value={
                                        stemVariationId === "two_stems_v1"
                                            ? "2"
                                            : "6"
                                    }
                                    onChange={(value) =>
                                        setParam("stems", value)
                                    }
                                />
                            )}
                            {transcription?.language && (
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
                                            setParam(
                                                "language",
                                                event.target.value,
                                            )
                                        }
                                    />
                                </FieldStack>
                            )}

                            {showsAudioLength && (
                                <FieldStack
                                    label={
                                        <span className="font-normal">
                                            Duration
                                        </span>
                                    }
                                    orientation="inline"
                                    className="min-w-0"
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        <Input
                                            className="w-24 min-w-0"
                                            aria-label="Duration in seconds"
                                            type="number"
                                            hideNumberSteppers
                                            min={0}
                                            step="any"
                                            placeholder={
                                                currentModel.defaultDuration?.toString() ??
                                                "Auto"
                                            }
                                            value={audioLength}
                                            onChange={(event) =>
                                                setParam(
                                                    "length",
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <Text
                                            as="span"
                                            size="sm"
                                            tone="muted"
                                            aria-hidden="true"
                                        >
                                            seconds
                                        </Text>
                                    </div>
                                </FieldStack>
                            )}
                            {isVisualModel && (
                                <>
                                    <OptionField
                                        label="Output format"
                                        options={formatOptions}
                                        value={format ?? "still"}
                                        onChange={(value) =>
                                            setParam(
                                                "format",
                                                value === "still" ? "" : value,
                                            )
                                        }
                                        format={imageFormatLabel}
                                    />
                                    <OptionField
                                        label="Resolution"
                                        options={currentModel.resolutions}
                                        value={mediaSettings.resolution}
                                        onChange={(value) =>
                                            setParam("size", value)
                                        }
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
                                                    setParam(
                                                        "aspect",
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
                                                onChange={(value) =>
                                                    setParam("sound", value)
                                                }
                                                format={(value) =>
                                                    value === "on"
                                                        ? "On"
                                                        : "Off"
                                                }
                                            />
                                        </>
                                    )}
                                    {videoDuration && (
                                        <VideoDurationField
                                            duration={videoDuration}
                                            onChange={(seconds) =>
                                                setParam("duration", seconds)
                                            }
                                        />
                                    )}
                                    {autoVideoDuration && (
                                        <FieldStack
                                            label="Duration"
                                            orientation="inline"
                                            className="min-w-0"
                                        >
                                            <Text size="sm" tone="muted">
                                                Replicate chooses the duration.
                                                Billing uses the output seconds.
                                            </Text>
                                        </FieldStack>
                                    )}

                                    {customSize && (
                                        <fieldset
                                            aria-labelledby={dimensionsLabelId}
                                            className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-2 max-sm:grid-cols-[5.5rem_minmax(0,1fr)] max-sm:gap-x-2"
                                        >
                                            <Text
                                                as="span"
                                                id={dimensionsLabelId}
                                                className="min-h-8 content-center"
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
                                                            "width",
                                                        ],
                                                        [
                                                            "Height",
                                                            height,
                                                            "height",
                                                        ],
                                                    ] as const
                                                ).map(
                                                    (
                                                        [label, value, key],
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
                                                                    setParam(
                                                                        key,
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
                                                setParam(
                                                    "seed",
                                                    event.target.value,
                                                )
                                            }
                                        />
                                    </FieldStack>
                                </>
                            )}
                        </div>
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
                            aria-describedby={
                                clipError && blockedReason === clipError
                                    ? clipStatusId
                                    : statusId
                            }
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
                        <Text
                            id={statusId}
                            size="xs"
                            tone="muted"
                            className="empty:hidden max-sm:w-full"
                        >
                            {blockedReason !== clipError && blockedReason}
                        </Text>
                    </div>
                    {/* Said once per conversation: gone after the first message. */}
                    {isAgent &&
                        currentModel &&
                        isCommunityRun(currentModel) &&
                        agentChat.turns.length === 0 && (
                            <Text
                                size="xs"
                                tone="muted"
                                data-theme="neutral"
                                className="-mt-2 flex items-start gap-2"
                            >
                                <WarningIcon
                                    aria-hidden="true"
                                    className="mt-0.5 size-3.5 shrink-0 text-intent-warning-text"
                                />
                                <span>
                                    Made by a community member, not
                                    Pollinations. Avoid sensitive data.{" "}
                                    <InlineLink href="/privacy" tone="quiet">
                                        Privacy Policy
                                    </InlineLink>
                                </span>
                            </Text>
                        )}

                    {/* Holds the result's place while an image or video is
                        on its way, so the API card below moves once, not
                        twice. Audio keeps just the button's cue. */}
                    {(error ||
                        authError ||
                        result ||
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
                            {result?.type === "image" && result.notice && (
                                <Alert intent="advisory">{result.notice}</Alert>
                            )}
                            {result && (
                                <ResultPanel
                                    key={activeCategory}
                                    result={result}
                                />
                            )}
                        </div>
                    )}
                    {apiUrl && (
                        <ApiUrlCard
                            url={apiUrl}
                            fields={apiFields}
                            pendingMessage={
                                isDecide && !decisionRequest
                                    ? "Complete the Decide form to see a copyable API request."
                                    : undefined
                            }
                        />
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        {needsSignIn && (
                            <Button
                                as="a"
                                href={ENTER_URL}
                                intent="brand"
                                icon={<GitHubIcon />}
                            >
                                Sign in with GitHub
                            </Button>
                        )}
                        <InlineLink href={`${API_BASE_URL}/docs`} tone="quiet">
                            Read the API docs
                        </InlineLink>
                    </div>
                </div>
            </div>
        </div>
    );
}

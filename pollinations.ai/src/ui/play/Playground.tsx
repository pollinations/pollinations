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
    ImageIcon,
    InfoTip,
    InlineLink,
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
    ModalityTab,
    modalityBgVar,
    modalityTextColor,
} from "@pollinations/ui/gen";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
    Fragment,
    type RefObject,
    useCallback,
    useEffect,
    useId,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import { API_BASE_URL, ENTER_URL } from "../../config";
import { PLAY_SEARCH_KEYS, type PlaySearch } from "../../routes/-play-search";
import { ApiUrlCard } from "./ApiUrlCard";
import { audioEndpoint } from "./audio-endpoint";
import { type ConnectDrafts, saveConnectDraft } from "./connect-draft";
import { MediaModelOption } from "./MediaModelOption";
import {
    type MediaModelMetadata,
    mediaModelSettings,
} from "./media-model-settings";
import {
    audioConstraintError,
    audioInputError,
    generatePlaygroundAudio,
    isVideo,
    type ReferenceUploads,
    supportsAudioLength,
    transcriptionControls,
    uploadReference,
    VIDEO_EXTENSIONS,
} from "./playground-audio";
import { formatRunCost, formatRunTime, type ModelRunStat } from "./run-stats";
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
    maxReferenceAudios?: number;
    audioInputConstraints?: ModelInfo["audio_input_constraints"];
};

const WORKSPACES = [
    {
        label: "Image",
        icon: ImageIcon,
        category: "image",
        operations: [{ id: "image", label: "Image" }],
    },
    {
        label: "Video",
        icon: VideoIcon,
        category: "video",
        operations: [{ id: "video", label: "Video" }],
    },
    {
        label: "Speech",
        icon: MicIcon,
        category: "audio",
        operations: [
            { id: "speech-generation", label: "Generate speech" },
            { id: "transcription", label: "Transcribe" },
            { id: "voice-changer", label: "Change voice" },
            { id: "voice-isolator", label: "Isolate speech" },
        ],
    },
    {
        label: "Music & Sounds",
        icon: AudioIcon,
        category: "audio",
        operations: [
            { id: "music-and-sound-effects", label: "Generate music & sounds" },
            { id: "stem-separation", label: "Separate stems" },
        ],
    },
] as const;
type Workspace = (typeof WORKSPACES)[number];
const TASKS = WORKSPACES.flatMap((workspace) =>
    workspace.operations.map((operation) => ({
        ...operation,
        workspace,
        runStore: createRunStore<PlaygroundResult>(),
    })),
);
type Task = (typeof TASKS)[number];

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
        maxReferenceAudios: model.max_reference_audios,
        audioInputConstraints: model.audio_input_constraints,
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
const UPLOAD_MAX_MB: Record<UploadMedia, number> = {
    image: 5,
    video: 20,
    audio: 20,
};

type PlaygroundResult =
    | {
          type: "image" | "video" | "audio" | "stems";
          url: string;
          filename: string;
      }
    | {
          type: "text";
          text: string;
      };

function promptPlaceholder(task: Task, editsImage: boolean): string {
    const {
        id,
        workspace: { category },
    } = task;
    if (editsImage) return "Describe the changes you want…";
    if (category === "image") return "Describe the image you want…";
    if (category === "video") return "Describe the video you want…";
    if (id === "transcription")
        return "Vocabulary, names, or context for the transcript";
    if (id === "speech-generation") return "Enter the words you want spoken…";
    if (id === "music-and-sound-effects")
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
// result and any run still in flight. Connect saves selected files for the redirect.
let lastInputs: PlaySearch | undefined;

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

function exampleReferenceUrls(media: UploadMedia, files: File[]) {
    return files
        .map(
            (_, index) =>
                `YOUR_UPLOADED_${media.toUpperCase()}_URL_${index + 1}`,
        )
        .join("|");
}

function audioTaskForModel(model: PlaygroundModel) {
    const endpoint = audioEndpoint(model);
    if (endpoint === "/v1/audio/transcriptions") return "transcription";
    if (endpoint === "/v1/audio/voice-changer") return "voice-changer";
    if (endpoint === "/v1/audio/voice-isolator") return "voice-isolator";
    if (endpoint === "/alpha/audio/stem-separation") return "stem-separation";
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

function supportsTask(model: PlaygroundModel, task: Task) {
    if (model.category !== task.workspace.category) return false;
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

function voiceLabel(voice: string) {
    return voice.charAt(0).toUpperCase() + voice.slice(1);
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
                format={voiceLabel}
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
                        aria-label={`Voice: ${voiceLabel(value)}`}
                    >
                        <span className="truncate">{voiceLabel(value)}</span>
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
                                    {voiceLabel(voice)}
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
    groups,
    selectedModel,
    isLoading,
    onSelectModel,
}: {
    groups: { task: Task; models: PlaygroundModel[] }[];
    selectedModel: string;
    isLoading: boolean;
    onSelectModel: (modelId: string) => void;
}) {
    const swipeStart = useRef<{ x: number; y: number } | null>(null);
    const swiped = useRef(false);
    const sorted = useMemo(
        () => groups.flatMap((group) => group.models),
        [groups],
    );
    const index = sorted.findIndex((model) => model.id === selectedModel);
    const selected = sorted[index];
    const canStep = !isLoading && index >= 0 && sorted.length > 1;

    function step(direction: number) {
        const next = (index + direction + sorted.length) % sorted.length;
        onSelectModel(sorted[next].id);
    }

    function stepButton(direction: -1 | 1) {
        if (!canStep) return null;
        const label = direction === -1 ? "Previous model" : "Next model";
        return (
            <Button
                size="icon"
                intent="neutral"
                className="shrink-0"
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
        <div className="flex min-w-0 items-center gap-2">
            {stepButton(-1)}
            <div className="w-80 min-w-0">
                <Dropdown
                    portalled={false}
                    className="w-[var(--reference-width)] overscroll-y-contain p-2 max-sm:w-[min(calc(100vw-2.5rem),24rem)]"
                    trigger={(open) => (
                        <Button
                            type="button"
                            intent="neutral"
                            size="lg"
                            disabled={isLoading || sorted.length === 0}
                            className="w-full touch-pan-y justify-between gap-2 pr-3 pl-6"
                            title={selected?.title}
                            aria-label={`Model: ${selected?.title ?? (sorted.length ? "Choose a model" : "Unavailable")}`}
                            aria-description={
                                selected &&
                                [
                                    selected.paidOnly
                                        ? "Uses paid balance only"
                                        : "Works with any balance",
                                    selected.publisher,
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
                                    <MediaModelOption model={selected} />
                                ) : sorted.length ? (
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
                        <ScrollArea className="max-h-80 overscroll-y-contain pr-2">
                            <div className="flex flex-col gap-1">
                                {groups.map((group) => (
                                    <fieldset
                                        key={group.task.id}
                                        className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0"
                                    >
                                        {groups.length > 1 && (
                                            <legend className="px-3 py-1 text-xs text-theme-text-muted">
                                                {group.task.label}
                                            </legend>
                                        )}
                                        {group.models.map((model) => (
                                            <TabButton
                                                key={model.id}
                                                active={
                                                    model.id === selectedModel
                                                }
                                                size="sm"
                                                variant="ghost"
                                                className="play-model-option w-full justify-start text-left"
                                                onClick={() => {
                                                    onSelectModel(model.id);
                                                    close();
                                                }}
                                            >
                                                <MediaModelOption
                                                    model={model}
                                                />
                                            </TabButton>
                                        ))}
                                    </fieldset>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </Dropdown>
            </div>
            {stepButton(1)}
        </div>
    );
}

function RunStatBadge({
    label,
    value,
    detail,
    href,
    linkLabel,
}: {
    label: string;
    value?: string;
    detail: string;
    href: string;
    linkLabel: string;
}) {
    const id = useId();
    const panel = useRef<HTMLDivElement>(null);
    const anchor = `--stat-${id}`;

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
                    panel.current?.hidePopover();
                }
            }}
        >
            <button
                type="button"
                popoverTarget={id}
                popoverTargetAction="show"
                style={{ anchorName: anchor }}
                aria-label={`${label} ${value ?? "unavailable"}`}
                className="flex cursor-help rounded-lg"
            >
                <Chip size="md" data-theme="neutral" className="tabular-nums">
                    <span className="text-theme-text-muted">{label}</span>{" "}
                    {value ?? "—"}
                </Chip>
            </button>
            <div
                ref={panel}
                id={id}
                popover="auto"
                style={{ positionAnchor: anchor }}
                className="play-stat-popover w-64 max-w-[calc(100vw-1.5rem)] rounded-lg bg-surface-menu px-3 py-2 text-xs text-theme-text-base shadow-lg"
            >
                <p>
                    {value ? detail : "No estimate available for this model."}
                </p>
                <InlineLink
                    href={href}
                    onBlur={() => panel.current?.hidePopover()}
                    tone="quiet"
                    className="mt-1 inline-block"
                    style={{ fontWeight: "inherit" }}
                >
                    {linkLabel}
                </InlineLink>
            </div>
        </div>
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

export function Playground({
    connectRef,
    drafts,
}: {
    connectRef: RefObject<(() => void) | null>;
    drafts: ConnectDrafts;
}) {
    const dimensionsLabelId = useId();
    const referencesLabelId = useId();
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
    const task =
        TASKS.find((item) => item.id === params.task) ??
        TASKS.find((item) => item.workspace.category === params.tab) ??
        TASKS[0];
    const activeCategory = task.workspace.category;
    const lastTask = useRef(new Map<Workspace, Task>());
    const taskDrafts = useRef(drafts);
    const savedDraft = drafts[params.task ?? task.id] ?? drafts[activeCategory];
    const restored =
        savedDraft?.params.model === params.model ? savedDraft : undefined;
    const {
        model: selectedModel = "",
        prompt = "",
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
    const [videoReferences, setVideoReferences] = useState<
        Record<UploadMedia, File[]>
    >(restored?.videoReferences ?? { image: [], video: [], audio: [] });
    const [recording, setRecording] = useState(false);
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
    const [stats, setStats] = useState<ModelRunStat[]>([]);
    const responseRef = useRef<HTMLDivElement>(null);
    const statusId = useId();
    const clipStatusId = useId();
    // Shared FileUpload limits and rejection messages for these media.
    const uploadProps = (
        media: UploadMedia[],
        tooMany: string,
        maxMb = Math.max(...media.map((item) => UPLOAD_MAX_MB[item])),
    ) => {
        const messages = {
            size: `Each file must be under ${maxMb} MB.`,
            count: tooMany,
            type: `Only ${media.join(" or ")} files are allowed.`,
        };
        const onReject: FileUploadProps["onReject"] = (rejected) =>
            runStore.set({ error: messages[rejected[0].reason] });
        return {
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
                .filter(
                    (model) =>
                        !model.community &&
                        model.health?.status !== "degraded" &&
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
        () => visibleModels.find((model) => model.id === selectedModel),
        [visibleModels, selectedModel],
    );
    const audioTask =
        currentModel?.category === "audio"
            ? audioTaskForModel(currentModel)
            : undefined;

    const groups = useMemo(
        () =>
            TASKS.filter((item) => item.workspace === task.workspace)
                .map((item) => ({
                    task: item,
                    models: visibleModels
                        .filter((model) => supportsTask(model, item))
                        .sort((a, b) =>
                            a.title.localeCompare(b.title, "en", {
                                numeric: true,
                                sensitivity: "base",
                            }),
                        ),
                }))
                .filter((group) => group.models.length),
        [task.workspace, visibleModels],
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
        if (selectedModel) return;
        const first = visibleModels.find((model) => supportsTask(model, task));
        if (first) setParams((previous) => ({ ...previous, model: first.id }));
    }, [
        task,
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
        lastInputs = { ...params, tab: activeCategory, voice: selectedVoice };
        showInUrl(lastInputs);
    }, [showInUrl, params, activeCategory, selectedVoice]);

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
    const referenceMode =
        params.guidance === "references" ? "references" : "frames";
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
        currentModel?.category !== "audio" ||
        (transcription?.prompt ??
            currentModel.inputModalities.includes("text"));
    const promptLabel = isAudioTranscription ? "Instructions" : "Description";
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
    const audioError = clipError ?? audioRequestError;
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
    const defaultVideoRatio = sendsVisualInput
        ? videoConfig.ratios[0]
        : videoConfig.defaultRatio;
    const videoAspectRatio =
        currentModel?.category === "video"
            ? aspectRatio && videoConfig.ratios.includes(pickedRatio)
                ? pickedRatio
                : defaultVideoRatio
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
    // A speech reference travels in the POST body.
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
                                image:
                                    supportsReferenceImages && !usesReferences
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
        setReferenceImages((current) => {
            if (current.length <= maxReferenceImages) return current;
            return current.slice(0, maxReferenceImages);
        });
    }, [maxReferenceImages, currentModel]);

    function selectTask(next: Task, modelId?: string) {
        if (next === task) return;
        lastTask.current.set(task.workspace, task);
        taskDrafts.current[task.id] = {
            params,
            referenceImages,
            videoReferences,
            audioFiles,
        };
        const draft = taskDrafts.current[next.id];
        const saved =
            !modelId || draft?.params.model === modelId ? draft : undefined;
        linkedModelRef.current = "";
        setParams({
            ...(saved?.params ?? {
                model:
                    modelId ??
                    visibleModels.find((model) => supportsTask(model, next))
                        ?.id,
            }),
            task: next.id,
            tab: next.workspace.category,
        });
        setReferenceImages(saved?.referenceImages ?? []);
        setVideoReferences(
            saved?.videoReferences ?? { image: [], video: [], audio: [] },
        );
        setAudioFiles(saved?.audioFiles ?? []);
    }

    function selectModel(modelId: string) {
        if (modelId === selectedModel) return;
        const group = groups.find((group) =>
            group.models.some((model) => model.id === modelId),
        );
        if (group && group.task !== task) {
            selectTask(group.task, modelId);
            return;
        }
        setParams((previous) => ({
            ...previous,
            model: modelId,
            size: undefined,
            duration: undefined,
            guidance: undefined,
            sound: undefined,
        }));
        setAudioFiles([]);
        setVideoReferences({ image: [], video: [], audio: [] });
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
            const uploadFiles = (files: File[]) =>
                Promise.all(
                    files.map((file) =>
                        uploadReference(client, file, session.referenceUrls),
                    ),
                );
            const requestSeed = fixedSeed ?? randomGenerationSeed();
            const referenceUrls =
                supportsReferenceImages && !usesReferences
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
        currentModel?.category === "image" &&
        (currentModel.id === "prunaai/p-image-edit" ||
            (currentModel.supportedEndpoints.includes("/v1/images/edits") &&
                !currentModel.supportedEndpoints.includes(
                    "/v1/images/generations",
                )));
    const editsImage =
        currentModel?.category === "image" &&
        (requiresImage || referenceImages.length > 0);
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
                      : currentAudioEndpoint === "/alpha/audio/stem-separation"
                        ? "Separate stems"
                        : "Generate audio"
              : editsImage
                ? "Edit image"
                : "Generate image";
    const GenerateIcon = isAudioTranscription
        ? MicIcon
        : CATEGORY_ICON[activeCategory];
    const busyLabel = isAudioTranscription ? "Transcribing…" : "Generating…";
    // The placeholder belongs to the tab whose run is in flight; audio has none.
    const busyVisual =
        running === "image" || running === "video" ? running : null;

    const againLabel = generateLabel.startsWith("Generate ")
        ? "Generate again"
        : generateLabel;
    const generateText = (
        <StableLabel
            text={
                isGenerating ? busyLabel : result ? againLabel : generateLabel
            }
            options={[generateLabel, againLabel, busyLabel]}
        />
    );
    const connectLabel = `Connect to ${generateLabel.toLowerCase()}`;

    // Signed out is a step, not a fault — handled by the button itself.
    const needsSignIn = isHydrated && !apiKey;
    const needsEditImage = requiresImage && referenceImages.length === 0;
    const missingInput = requiresMediaUpload
        ? audioFiles.length === 0
        : !prompt.trim();

    /** Why the button cannot fire, or null when it can. Shown beside the button. */
    const blockedReason = recording
        ? "Finish recording first"
        : needsSignIn
          ? null
          : audioError
            ? audioError
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
                videoReferences,
                audioFiles,
            },
        };
        try {
            if (
                Object.values(saved).some(
                    (draft) =>
                        draft.referenceImages.length ||
                        draft.audioFiles.length ||
                        Object.values(draft.videoReferences).some(
                            (files) => files.length,
                        ),
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
    useImperativeHandle(connectRef, () => connect);
    const run = needsSignIn ? connect : generate;
    const modelStats = stats.find((stat) => stat.model === currentModel?.id);
    const cost = formatRunCost(modelStats?.avg_cost_usd);
    const time = formatRunTime(modelStats?.avg_response_ms);

    const clipStatus = clipError && <span id={clipStatusId}>{clipError}</span>;
    const audioInput =
        currentModel?.category === "audio" && acceptsMediaUpload ? (
            <FieldStack
                orientation="inline"
                helper={uploadMedia.includes("audio") ? clipStatus : undefined}
                className="min-w-0"
                label={
                    requiresMediaUpload
                        ? `${mediaUploadLabel.charAt(0).toUpperCase()}${mediaUploadLabel.slice(1)} input`
                        : "References"
                }
            >
                {uploadMedia.includes("audio") ? (
                    <AudioInput
                        key={currentModel.id}
                        value={audioFiles}
                        onChange={setAudioFiles}
                        onBusyChange={setRecording}
                        onClipDuration={onClipDuration}
                        disabled={isGenerating}
                        importLabel={`Import ${mediaUploadLabel}`}
                        {...uploadProps(
                            uploadMedia,
                            "Use one media file.",
                            isStemSeparation ? 50 : undefined,
                        )}
                    />
                ) : (
                    <FileUpload
                        value={audioFiles}
                        onChange={setAudioFiles}
                        disabled={isGenerating}
                        maxFiles={1}
                        {...uploadProps(uploadMedia, "Use one media file.")}
                        icon={<MediaUploadIcon className="h-6 w-6 shrink-0" />}
                        previewIcon={<MediaUploadIcon className="h-5 w-5" />}
                        label={`Add ${mediaUploadLabel}`}
                    />
                )}
                {!requiresMediaUpload && audioFiles.length > 0 && (
                    <UploadPrivacyNote />
                )}
            </FieldStack>
        ) : null;
    const frameTiles =
        isVideoReferenceMode &&
        (supportsLastFrame
            ? ["First frame", "Last frame"]
            : ["First frame"]
        ).map((label, index) => (
            <fieldset
                key={label}
                aria-label={label}
                className="m-0 min-w-0 border-0 p-0"
            >
                <FileUpload
                    value={referenceImages.slice(index, index + 1)}
                    onChange={(files) => setFrameImage(index, files)}
                    maxFiles={1}
                    {...uploadProps(
                        ["image"],
                        `Use one image for the ${label.toLowerCase()}.`,
                    )}
                    disabled={index > 0 && !referenceImages[0]}
                    label={label}
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
            <div className="@container">
                <fieldset
                    aria-label="Playground task"
                    className="m-0 grid min-w-0 grid-cols-2 gap-2 border-0 p-0 @min-[36rem]:flex"
                >
                    {WORKSPACES.map((item) => (
                        <ModalityTab
                            key={item.label}
                            active={item === task.workspace}
                            size="lg"
                            className="max-sm:px-2"
                            modality={item.category}
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
            </div>

            <div className="grid grid-cols-1 overflow-clip">
                {catalogError && (
                    <div className="pt-4">
                        <Alert intent="danger">
                            Model catalog failed to load: {catalogError.message}
                        </Alert>
                    </div>
                )}
                <div className="flex flex-col gap-4 pt-6">
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
                    <div className="flex min-w-0 flex-col gap-2">
                        <ModelPicker
                            groups={groups}
                            selectedModel={selectedModel}
                            isLoading={isLoading || !isHydrated}
                            onSelectModel={selectModel}
                        />
                        {currentModel && (
                            <>
                                {currentModel.description && (
                                    <Text>{currentModel.description}</Text>
                                )}
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <RunStatBadge
                                        label="Cost"
                                        value={cost}
                                        detail="Median charge per successful paid request over the last 7 days. Your settings can affect the price."
                                        href={`${ENTER_URL}/models?${new URLSearchParams({ category: currentModel.category, q: currentModel.id })}`}
                                        linkLabel="Pricing"
                                    />
                                    <RunStatBadge
                                        label="Time"
                                        value={time}
                                        detail="Average response time for successful requests over the last 7 days."
                                        href="https://model-monitor.pollinations.ai"
                                        linkLabel="Model Monitor"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                    <Surface
                        as="section"
                        variant="card"
                        aria-label="Generation inputs"
                        className="@container/play-inputs flex flex-col gap-5"
                    >
                        {showPromptInput && (
                            <FieldStack
                                label={
                                    <>
                                        {promptLabel}
                                        {isAudioTranscription && (
                                            <span className="font-normal text-theme-text-muted">
                                                {" "}
                                                (optional)
                                            </span>
                                        )}
                                    </>
                                }
                            >
                                <Textarea
                                    value={prompt}
                                    rows={isAudioTranscription ? 3 : 7}
                                    onChange={(event) =>
                                        setParam("prompt", event.target.value)
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
                                    onChange={(value) =>
                                        setParam("voice", value)
                                    }
                                />
                            )}
                            {audioInput}

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

                            {isReferenceImageListMode && (
                                <div className="min-w-0">
                                    <FieldStack
                                        orientation="inline"
                                        className="min-w-0"
                                        label={
                                            <span className="inline-flex flex-wrap items-center gap-2">
                                                {requiresImage
                                                    ? "Image required"
                                                    : "Reference images"}
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
                                            label="Add image"
                                        />
                                        {referenceImages.length > 0 && (
                                            <UploadPrivacyNote />
                                        )}
                                    </FieldStack>
                                </div>
                            )}

                            {(isVideoReferenceMode ||
                                videoReferenceMedia.length > 0) && (
                                <fieldset
                                    aria-labelledby={referencesLabelId}
                                    className="m-0 min-w-0 border-0 p-0"
                                >
                                    <FieldStack
                                        orientation="inline"
                                        label={
                                            <span id={referencesLabelId}>
                                                References
                                            </span>
                                        }
                                    >
                                        {videoConfig.exclusiveReferences && (
                                            <ButtonGroup aria-label="Reference type">
                                                {["frames", "references"].map(
                                                    (mode) => (
                                                        <TabButton
                                                            key={mode}
                                                            size="sm"
                                                            active={
                                                                mode ===
                                                                referenceMode
                                                            }
                                                            onClick={() =>
                                                                setParam(
                                                                    "guidance",
                                                                    mode,
                                                                )
                                                            }
                                                        >
                                                            {mode === "frames"
                                                                ? "Frames"
                                                                : "Media"}
                                                        </TabButton>
                                                    ),
                                                )}
                                            </ButtonGroup>
                                        )}
                                        <div className="flex flex-wrap items-start gap-3">
                                            {frameTiles}
                                            {videoReferenceMedia.map(
                                                (media) => {
                                                    const Icon =
                                                        CATEGORY_ICON[media];
                                                    const maxVideos =
                                                        media === "video"
                                                            ? currentModel?.maxReferenceVideos
                                                            : undefined;
                                                    return (
                                                        <div
                                                            key={media}
                                                            className="min-w-0 max-w-full"
                                                        >
                                                            {media ===
                                                            "audio" ? (
                                                                <AudioInput
                                                                    key={
                                                                        currentModel?.id
                                                                    }
                                                                    value={
                                                                        videoReferences.audio
                                                                    }
                                                                    onChange={(
                                                                        audio,
                                                                    ) =>
                                                                        setVideoReferences(
                                                                            (
                                                                                previous,
                                                                            ) => ({
                                                                                ...previous,
                                                                                audio,
                                                                            }),
                                                                        )
                                                                    }
                                                                    onBusyChange={
                                                                        setRecording
                                                                    }
                                                                    onClipDuration={
                                                                        onClipDuration
                                                                    }
                                                                    disabled={
                                                                        isGenerating
                                                                    }
                                                                    maxFiles={
                                                                        currentModel?.maxReferenceAudios ??
                                                                        Infinity
                                                                    }
                                                                    {...uploadProps(
                                                                        [
                                                                            "audio",
                                                                        ],
                                                                        "Too many audio clips.",
                                                                    )}
                                                                />
                                                            ) : (
                                                                <FileUpload
                                                                    value={
                                                                        videoReferences[
                                                                            media
                                                                        ]
                                                                    }
                                                                    onChange={(
                                                                        files,
                                                                    ) =>
                                                                        setVideoReferences(
                                                                            (
                                                                                previous,
                                                                            ) => ({
                                                                                ...previous,
                                                                                [media]:
                                                                                    files,
                                                                            }),
                                                                        )
                                                                    }
                                                                    maxFiles={
                                                                        maxVideos ??
                                                                        Infinity
                                                                    }
                                                                    {...uploadProps(
                                                                        [media],
                                                                        maxVideos
                                                                            ? `Use up to ${maxVideos === 1 ? "1 video" : `${maxVideos} videos`}.`
                                                                            : "Too many files.",
                                                                    )}
                                                                    label={`Add ${media}`}
                                                                    icon={
                                                                        <Icon className="h-6 w-6 shrink-0" />
                                                                    }
                                                                />
                                                            )}
                                                        </div>
                                                    );
                                                },
                                            )}
                                        </div>
                                        {clipStatus && (
                                            <Text size="xs" tone="muted">
                                                {clipStatus}
                                            </Text>
                                        )}
                                        {((isVideoReferenceMode &&
                                            referenceImages.length > 0) ||
                                            videoReferenceMedia.some(
                                                (media) =>
                                                    videoReferences[media]
                                                        .length > 0,
                                            )) && <UploadPrivacyNote />}
                                    </FieldStack>
                                </fieldset>
                            )}
                            {isVisualModel && (
                                <>
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
                            {result && (
                                <ResultPanel
                                    key={activeCategory}
                                    result={result}
                                />
                            )}
                        </div>
                    )}
                    {apiUrl && <ApiUrlCard url={apiUrl} fields={apiFields} />}
                </div>
            </div>
        </div>
    );
}

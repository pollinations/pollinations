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
    ImageIcon,
    InfoTip,
    InlineLink,
    Input,
    LayersIcon,
    MediaPlaceholder,
    MicIcon,
    ScrollArea,
    Slider,
    SpeakingHeadIcon,
    StableLabel,
    Surface,
    TabButton,
    Text,
    Textarea,
    TranscribeIcon,
    UploadedFileTile,
    VideoIcon,
    VideoRecorder,
    XIcon,
} from "@pollinations/ui";
import {
    ModalityTab,
    modalityBgVar,
    modalityTextColor,
} from "@pollinations/ui/gen";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
    Fragment,
    type ReactNode,
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
import { playgroundModelOverride } from "../../data/playground-model-overrides";
import { PLAY_SEARCH_KEYS, type PlaySearch } from "../../routes/-play-search";
import { ApiUrlCard } from "./ApiUrlCard";
import { audioEndpoint } from "./audio-endpoint";
import {
    type ConnectDrafts,
    saveConnectDraft,
    type VideoReference,
} from "./connect-draft";
import { DecisionAnswerPanel } from "./DecisionAnswerPanel";
import {
    decisionForm,
    questionTypeLabel,
    URGENCY_EXAMPLE,
    verifiedQuestionTypes,
} from "./decision";
import { MediaModelOption } from "./MediaModelOption";
import {
    type MediaModelMetadata,
    mediaModelSettings,
} from "./media-model-settings";
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
    outputFormats?: ModelInfo["output_formats"];
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
        label: "Video",
        icon: VideoIcon,
        category: "video",
        operations: ["video"],
    },
    {
        label: "Image",
        icon: ImageIcon,
        category: "image",
        operations: ["image"],
    },
    {
        label: "GIF · SVG",
        icon: LayersIcon,
        category: "image",
        operations: ["gif"],
    },
    {
        label: "Voice",
        icon: SpeakingHeadIcon,
        category: "audio",
        operations: ["speech-generation", "voice-changer", "voice-isolator"],
    },
    {
        label: "Transcribe",
        icon: TranscribeIcon,
        category: "audio",
        operations: ["transcription"],
    },
    {
        label: "Music",
        icon: AudioIcon,
        category: "audio",
        operations: ["music-and-sound-effects", "stem-separation"],
    },
    {
        label: "Decide",
        icon: GitBranchIcon,
        category: "decision",
        operations: ["decide"],
    },
] as const;
type Workspace = (typeof WORKSPACES)[number];
const TASKS = WORKSPACES.flatMap((workspace) =>
    workspace.operations.map((id) => ({
        id,
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
        outputFormats: model.output_formats,
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

type MediaResult =
    | {
          type: "image" | "video" | "audio" | "stems";
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
    format?: "gif" | "svg",
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

const FORMAT_MIME = { gif: "image/gif", svg: "image/svg+xml" } as const;

/** MIME subtypes that are not the usual file extension. */
const FILE_EXTENSIONS: Record<string, string> = {
    "image/jpeg": "jpg",
    [FORMAT_MIME.svg]: "svg",
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

// Play can request GIF explicitly. SVG is currently a native output.
function specialImageFormat(formats: PlaygroundModel["outputFormats"]) {
    if (formats?.svg?.mode === "native") return "svg";
    if (formats?.gif) return "gif";
}

function supportsTask(model: PlaygroundModel, task: Task) {
    if (model.category !== task.workspace.category) return false;
    if (task.id === "decide")
        return (
            model.supportedEndpoints.includes("/alpha/decisions") &&
            verifiedQuestionTypes(model.id).length > 0
        );
    const format = specialImageFormat(model.outputFormats);
    if (task.id === "gif") return !!format;
    if (format && model.outputFormats?.[format]?.mode === "native")
        return false;
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

function ModelPicker({
    models,
    selectedModel,
    isLoading,
    onSelectModel,
}: {
    models: PlaygroundModel[];
    selectedModel: string;
    isLoading: boolean;
    onSelectModel: (model: PlaygroundModel) => void;
}) {
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
        <div className="flex min-w-0 items-center gap-2">
            {stepButton(-1)}
            <div className="w-full min-w-0 @min-[28rem]:w-80">
                <Dropdown
                    portalled={false}
                    className="w-[var(--reference-width)] overscroll-y-contain p-2"
                    trigger={(open) => (
                        <Button
                            type="button"
                            intent="neutral"
                            size="lg"
                            disabled={isLoading || models.length === 0}
                            className="w-full touch-pan-y justify-between gap-2 pr-3 pl-6"
                            title={selected?.title}
                            aria-label={`Model: ${selected?.title ?? (models.length ? "Choose a model" : "Unavailable")}`}
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
                                    <MediaModelOption
                                        model={selected}
                                        showWalletIcon={false}
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
                        <ScrollArea className="max-h-80 overscroll-y-contain pr-2">
                            <div className="flex flex-col gap-1">
                                {models.map((model) => (
                                    <TabButton
                                        key={model.id}
                                        active={model.id === selectedModel}
                                        size="sm"
                                        variant="ghost"
                                        className="play-model-option w-full justify-start text-left"
                                        onClick={() => {
                                            onSelectModel(model);
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
            {stepButton(1)}
        </div>
    );
}

function RunStatBadge({
    label,
    value,
    afterValue,
    detail,
    href,
    linkLabel,
}: {
    label: string;
    value?: string;
    afterValue?: ReactNode;
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
                    {afterValue}
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
    result: MediaResult;
    className?: string;
}) {
    const format =
        result.type === "image" &&
        Object.keys(FORMAT_MIME).find((ext) =>
            result.filename.endsWith(`.${ext}`),
        );
    const label = `Download ${format ? format.toUpperCase() : result.type}`;
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

export function Playground({
    connectRef,
    drafts,
}: {
    connectRef: RefObject<(() => void) | null>;
    drafts: ConnectDrafts;
}) {
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
    const task =
        TASKS.find((item) => item.id === params.task) ??
        TASKS.find((item) => item.workspace.category === params.tab) ??
        TASKS[0];
    const isDecide = task.id === "decide";
    const activeCategory = task.workspace.category;
    const isFormatTab = task.id === "gif";
    const lastTask = useRef(new Map<Workspace, Task>());
    const taskDrafts = useRef(drafts);
    const savedDraft =
        drafts[task.id] ?? (isFormatTab ? undefined : drafts[activeCategory]);
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

    const hasFormatModels = visibleModels.some(
        (model) =>
            model.category === "image" &&
            !!specialImageFormat(model.outputFormats),
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

    const pickerModels = useMemo(() => {
        const tasks = TASKS.filter((item) => item.workspace === task.workspace);
        return visibleModels
            .filter((model) => tasks.some((item) => supportsTask(model, item)))
            .sort((a, b) =>
                a.title.localeCompare(b.title, "en", {
                    numeric: true,
                    sensitivity: "base",
                }),
            );
    }, [task.workspace, visibleModels]);
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
        if (isFormatTab && !hasFormatModels) {
            setParams((previous) => ({
                ...previous,
                task: "image",
                tab: "image",
                model:
                    linkedModel?.category === "image"
                        ? linkedModel.id
                        : undefined,
            }));
            return;
        }
        if (linkedModel && (!isFormatTab || supportsTask(linkedModel, task))) {
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
        if (selectedModel && ((!isFormatTab && !isDecide) || currentModel))
            return;
        const first = visibleModels.find((model) => supportsTask(model, task));
        if (first) setParams((previous) => ({ ...previous, model: first.id }));
    }, [
        task,
        isFormatTab,
        isDecide,
        hasFormatModels,
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
    const format = isFormatTab
        ? specialImageFormat(currentModel?.outputFormats)
        : undefined;
    const formatInfo = format
        ? currentModel?.outputFormats?.[format]
        : undefined;
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
        supportsFrames &&
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
    const showPromptInput = isFormatTab
        ? !!formatInfo?.input_modalities.includes("text")
        : currentModel?.category !== "audio" ||
          (transcription?.prompt ??
              currentModel.inputModalities.includes("text"));
    const promptLabel = isDecide
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
    const videoDuration =
        currentModel?.category === "video" ? mediaSettings.duration : undefined;
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
    const isVisualModel =
        currentModel?.category === "image" ||
        currentModel?.category === "video";
    const gifOptions =
        format === "gif" && formatInfo?.mode === "selectable"
            ? {
                  outputFormat: "gif" as const,
                  frameCount: formatInfo.frame_defaults?.frame_count,
                  frameDurationMs: formatInfo.frame_defaults?.frame_duration_ms,
              }
            : undefined;
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
            : decisionRequest;
    const postEndpoint = isDecide
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
                                output_format: gifOptions?.outputFormat,
                                frame_count: gifOptions?.frameCount,
                                frame_duration_ms: gifOptions?.frameDurationMs,
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
            videoReferences: referenceQueue,
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
        setReferenceQueue(saved?.videoReferences ?? []);
        setAudioFiles(saved?.audioFiles ?? []);
    }

    function selectModel(model: PlaygroundModel) {
        const modelId = model.id;
        if (modelId === selectedModel) return;
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
            size: undefined,
            duration: undefined,
            sound: undefined,
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
                    ...gifOptions,
                    resolution: mediaSettings.resolution,
                    seed: requestSeed,
                    referenceImage:
                        referenceUrls.length > 0 ? referenceUrls : undefined,
                });
                if (
                    format &&
                    response.contentType.split(";")[0].trim() !==
                        FORMAT_MIME[format]
                )
                    throw new Error(
                        `Expected a ${format.toUpperCase()} image, but the model returned ${response.contentType}.`,
                    );
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
        format !== "gif" &&
        currentModel?.category === "image" &&
        ((modelOverride?.requiresImage && inputModalities?.includes("image")) ||
            (currentModel.supportedEndpoints.includes("/v1/images/edits") &&
                !currentModel.supportedEndpoints.includes(
                    "/v1/images/generations",
                )));
    const editsImage =
        currentModel?.category === "image" &&
        (requiresImage || referenceImages.length > 0);
    const generateLabel = isDecide
        ? "Evaluate"
        : format
          ? `Generate ${format.toUpperCase()}`
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
              : editsImage
                ? "Edit image"
                : "Generate image";
    const GenerateIcon = task.workspace.icon;
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
    const generateText = (
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
    const missingInput = requiresMediaUpload
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
    useImperativeHandle(connectRef, () => connect);
    const run = needsSignIn ? connect : generate;
    const modelStats = stats.find((stat) => stat.model === currentModel?.id);
    const cost = formatRunCost(modelStats?.avg_cost_usd);
    const time = formatRunTime(modelStats?.avg_response_ms);

    const clipStatus = clipError && <span id={clipStatusId}>{clipError}</span>;
    const cameraTile = (maxBytes: number, onRecord: (file: File) => void) => (
        <VideoRecorder
            key={currentModel?.id}
            maxBytes={maxBytes}
            onRecord={onRecord}
            onBusyChange={setRecordingVideo}
            disabled={recordingAudio || isGenerating || mediaDisabled}
        />
    );
    const audioUploadProps = acceptsMediaUpload
        ? uploadProps(
              uploadMedia,
              "Use one media file.",
              isStemSeparation ? 50 : undefined,
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
            videoReferenceMedia.includes(item.media) && (
                <UploadedFileTile
                    key={item.id}
                    drop={videoUploadProps(item.media)}
                    file={item.file}
                    modality={item.media}
                    disabled={
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
    const videoPicker = videoReferenceMedia.includes("video")
        ? videoUploadProps("video")
        : undefined;
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
            <fieldset
                aria-label="Playground task"
                className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
            >
                {WORKSPACES.filter(
                    (item) => item.operations[0] !== "gif" || hasFormatModels,
                ).map((item) => (
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
                                    (candidate) => candidate.workspace === item,
                                );
                            if (next) selectTask(next);
                        }}
                    >
                        {item.label}
                    </ModalityTab>
                ))}
            </fieldset>

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
                    <div className="@container flex min-w-0 flex-col gap-2">
                        <ModelPicker
                            models={pickerModels}
                            selectedModel={selectedModel}
                            isLoading={isLoading || !isHydrated}
                            onSelectModel={selectModel}
                        />
                        {currentModel && (
                            <>
                                {currentModel.description && (
                                    <Text tone="soft" data-theme="accent">
                                        {currentModel.description}
                                    </Text>
                                )}
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <RunStatBadge
                                        label="Cost"
                                        value={cost}
                                        afterValue={
                                            <WalletKindIcon
                                                kind={
                                                    currentModel.paidOnly
                                                        ? "paid"
                                                        : "tier"
                                                }
                                            />
                                        }
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
                        <fieldset
                            aria-label="Model input"
                            className="flex min-w-0 flex-col gap-3"
                        >
                            {showPromptInput && (
                                <FieldStack
                                    label={isDecide ? "Context" : undefined}
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
                                    <FieldStack label="Question">
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
                                        <FieldStack
                                            label={
                                                decision.type === "score"
                                                    ? "Scale (low to high, one per line)"
                                                    : "Choices (one per line)"
                                            }
                                        >
                                            <Textarea
                                                rows={3}
                                                aria-label={
                                                    decision.type === "score"
                                                        ? "Scale"
                                                        : "Choices"
                                                }
                                                value={decision.criteria}
                                                onChange={(event) =>
                                                    setParam(
                                                        decision.type ===
                                                            "score"
                                                            ? "levels"
                                                            : "choices",
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                        </FieldStack>
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
                                        {videoReferenceMedia.map((media) => {
                                            const props =
                                                videoUploadProps(media);
                                            return media === "audio" ? (
                                                <AudioInput
                                                    key={`${currentModel?.id}-audio`}
                                                    actionsOnly
                                                    {...props}
                                                    onBusyChange={
                                                        setRecordingAudio
                                                    }
                                                    disabled={
                                                        isGenerating ||
                                                        recordingVideo ||
                                                        mediaDisabled
                                                    }
                                                />
                                            ) : (
                                                <FileUpload
                                                    key={media}
                                                    actionsOnly
                                                    {...props}
                                                    disabled={
                                                        mediaDisabled ||
                                                        (media === "video" &&
                                                            recordingVideo)
                                                    }
                                                    label={capitalize(media)}
                                                />
                                            );
                                        })}
                                        {videoPicker &&
                                            videoPicker.value.length <
                                                videoPicker.maxFiles &&
                                            cameraTile(
                                                videoPicker.maxSizeBytes,
                                                (file) =>
                                                    videoPicker.onChange([
                                                        ...videoPicker.value,
                                                        file,
                                                    ]),
                                            )}
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
                    {apiUrl && (!isDecide || decisionRequest) && (
                        <ApiUrlCard url={apiUrl} fields={apiFields} />
                    )}
                </div>
            </div>
        </div>
    );
}

import {
    type AudioFormat,
    type ChatRoutingCapability,
    type MessageContentPart,
    Pollinations,
    PollinationsError,
} from "@pollinations/sdk";
import {
    useAuthActions,
    useAuthState,
    useModelCatalog,
} from "@pollinations/sdk/react";
import {
    Alert,
    BeakerIcon,
    Button,
    ChatIcon,
    ChevronIcon,
    Chip,
    CloudUploadIcon,
    cn,
    Dropdown,
    FileUpload,
    ImageIcon,
    RobotIcon,
    RocketIcon,
    ScrollArea,
    TabButton,
    Text,
    Textarea,
    TrashIcon,
} from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
import {
    type ClipboardEvent,
    type CSSProperties,
    type DragEvent,
    type FormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    type AgentChoice,
    AUTO_ROUTING,
    agentChoices,
    arrayBufferToBase64,
    audioFormat,
    buildUserContent,
    type ChatAttachmentKind,
    type ChatMessageState,
    compactRouting,
    conversationForRequest,
    extractStreamedMedia,
    fileKind,
    type RenderedMedia,
    type RoutingChoice,
    type RoutingSelection,
    routingChoices,
} from "./chat-models";

// @pollinations/ui does not export this website-local ordering.
const CHAT_ROUTING_FIELDS = [
    "text",
    "web_search",
    "image_generation",
    "image_editing",
    "video",
    "audio",
] as const satisfies readonly ChatRoutingCapability[];

const ROUTING_LABELS: Record<ChatRoutingCapability, string> = {
    text: "Text",
    web_search: "Web search",
    image_generation: "Image",
    image_editing: "Image edit",
    video: "Video",
    audio: "Audio",
};

function routingThemeStyle(): CSSProperties {
    return {
        "--play-routing-accent": "var(--polli-color-text-soft)",
    } as CSSProperties;
}

const FLORET_MODEL_ID = "floret";
const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_ACCEPT: Record<ChatAttachmentKind, string> = {
    image: "image/*",
    video: "video/*",
    audio: "audio/*",
    file: ".pdf,.txt,.md,.csv,.json,.doc,.docx",
};

type ViteImportMeta = ImportMeta & {
    env?: { VITE_POLLINATIONS_API_BASE_URL?: string };
};

const API_BASE_URL = (
    (import.meta as ViteImportMeta).env?.VITE_POLLINATIONS_API_BASE_URL ||
    "https://gen.pollinations.ai"
).replace(/\/$/, "");

interface PreparedAttachment {
    id: string;
    name: string;
    mimeType: string;
    kind: ChatAttachmentKind;
    url: string;
    contentPart: MessageContentPart;
}

interface ConversationMessage extends ChatMessageState {
    attachments: PreparedAttachment[];
}

function welcomeMessage(agent: AgentChoice): ConversationMessage {
    return {
        id: `${agent.id}-welcome`,
        role: "assistant",
        content:
            agent.id === FLORET_MODEL_ID
                ? "👋 Hi, I’m Floret — an AI agent. That means I can combine several tasks in one conversation: chat, search, and create text, images, video, or audio. What would you like to make? ✨"
                : `👋 You’re chatting with ${agent.title}. What would you like help with?`,
        status: "complete",
        attachments: [],
    };
}

function attachmentKinds(agent: AgentChoice | undefined) {
    if (!agent) return new Set<ChatAttachmentKind>();
    if (agent.id === FLORET_MODEL_ID)
        return new Set<ChatAttachmentKind>(["image", "video", "audio", "file"]);
    return new Set(
        agent.inputModalities.filter(
            (modality): modality is ChatAttachmentKind =>
                modality === "image" ||
                modality === "video" ||
                modality === "audio" ||
                modality === "file",
        ),
    );
}

function errorMessage(error: unknown): string {
    if (error instanceof PollinationsError) return error.message;
    if (error instanceof Error) return error.message;
    return "Something went wrong. Please try again.";
}

function isCancellation(error: unknown): boolean {
    return (
        (error instanceof PollinationsError && error.code === "CANCELLED") ||
        (error instanceof DOMException && error.name === "AbortError")
    );
}

async function prepareAttachment(
    client: Pollinations,
    file: File,
    signal: AbortSignal,
): Promise<PreparedAttachment> {
    const kind = fileKind(file);
    const format = kind === "audio" ? audioFormat(file) : null;
    if (kind === "audio" && !format) {
        throw new Error(`${file.name} uses an unsupported audio format.`);
    }

    const [upload, audioBuffer] = await Promise.all([
        client.upload(file, {
            name: file.name,
            contentType: file.type || undefined,
            signal,
        }),
        kind === "audio" ? file.arrayBuffer() : Promise.resolve(null),
    ]);
    const mimeType = upload.contentType || file.type;
    return {
        id: upload.id,
        name: file.name,
        mimeType,
        kind,
        url: upload.url,
        contentPart: attachmentPart(
            kind,
            upload.url,
            file,
            mimeType,
            format,
            audioBuffer,
        ),
    };
}

function attachmentPart(
    kind: ChatAttachmentKind,
    url: string,
    file: File,
    mimeType: string,
    format: AudioFormat | null,
    audioBuffer: ArrayBuffer | null,
): MessageContentPart {
    if (kind === "image") {
        return { type: "image_url", image_url: { url, mime_type: mimeType } };
    }
    if (kind === "video") {
        return { type: "video_url", video_url: { url, mime_type: mimeType } };
    }
    if (kind === "audio" && format && audioBuffer) {
        return {
            type: "input_audio",
            input_audio: { data: arrayBufferToBase64(audioBuffer), format },
        };
    }
    return {
        type: "file",
        file: { file_url: url, file_name: file.name, mime_type: mimeType },
    };
}

function textContent(message: ConversationMessage): string {
    if (typeof message.content === "string") return message.content;
    return message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
}

function AttachmentView({ attachment }: { attachment: PreparedAttachment }) {
    if (attachment.kind === "image") {
        return (
            <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                <img
                    src={attachment.url}
                    alt={attachment.name}
                    loading="lazy"
                    className="play-chat-media rounded-lg"
                />
            </a>
        );
    }
    if (attachment.kind === "video") {
        return (
            <>
                {/* biome-ignore lint/a11y/useMediaCaption: User-provided media has no caption track. */}
                <video
                    src={attachment.url}
                    controls
                    preload="metadata"
                    className="play-chat-media rounded-lg"
                />
            </>
        );
    }
    if (attachment.kind === "audio") {
        return (
            <>
                {/* biome-ignore lint/a11y/useMediaCaption: User-provided media has no caption track. */}
                <audio
                    src={attachment.url}
                    controls
                    preload="metadata"
                    className="max-w-full"
                />
            </>
        );
    }
    return (
        <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-sm font-semibold underline"
        >
            {attachment.name}
        </a>
    );
}

function MediaView({ media }: { media: RenderedMedia }) {
    if (media.kind === "image") {
        return (
            <img
                src={media.url}
                alt={media.label || "Generated image"}
                loading="lazy"
                className="play-chat-media rounded-xl bg-theme-bg-pale"
            />
        );
    }
    if (media.kind === "video") {
        return (
            <>
                {/* biome-ignore lint/a11y/useMediaCaption: Generated media does not include a caption track. */}
                <video
                    src={media.url}
                    controls
                    preload="metadata"
                    className="play-chat-media rounded-xl bg-theme-bg-pale"
                />
            </>
        );
    }
    return (
        <>
            {/* biome-ignore lint/a11y/useMediaCaption: Generated media does not include a caption track. */}
            <audio
                src={media.url}
                controls
                preload="metadata"
                className="w-full max-w-xl"
            />
        </>
    );
}

function MessageCard({
    message,
    assistantName,
    canRetry,
    onRetry,
}: {
    message: ConversationMessage;
    assistantName: string;
    canRetry: boolean;
    onRetry: () => void;
}) {
    const rawText = textContent(message);
    const rendered =
        message.role === "assistant"
            ? extractStreamedMedia(rawText)
            : { markdown: rawText, media: [] };
    const isUser = message.role === "user";

    return (
        <article
            className={cn(
                "play-chat-message flex min-w-0 flex-col gap-3 rounded-xl px-4 py-3",
                isUser
                    ? "ml-auto bg-theme-bg-active text-theme-text-strong"
                    : "mr-auto bg-surface-opaque text-theme-text-base shadow-well",
            )}
            aria-busy={message.status === "streaming"}
        >
            {isUser ? (
                <Text
                    as="div"
                    size="xs"
                    tone="muted"
                    weight="bold"
                    className="uppercase tracking-wide"
                >
                    You
                </Text>
            ) : (
                <RobotIcon className="h-4 w-4 text-theme-text-strong" />
            )}
            {isUser
                ? rendered.markdown && (
                      <p className="whitespace-pre-wrap break-words">
                          {rendered.markdown}
                      </p>
                  )
                : rendered.markdown && <Markdown>{rendered.markdown}</Markdown>}
            {message.attachments.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                    {message.attachments.map((attachment) => (
                        <AttachmentView
                            key={attachment.id}
                            attachment={attachment}
                        />
                    ))}
                </div>
            )}
            {rendered.media.length > 0 && (
                <div className="flex flex-col gap-3">
                    {rendered.media.map((media) => (
                        <div
                            key={`${media.kind}:${media.url}`}
                            className="flex flex-col gap-2"
                        >
                            <MediaView media={media} />
                            <a
                                href={media.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all text-xs font-semibold underline"
                            >
                                Open {media.kind}
                            </a>
                        </div>
                    ))}
                </div>
            )}
            {message.status === "streaming" && !rawText && (
                <Text size="sm" tone="muted">
                    {assistantName} is thinking…
                </Text>
            )}
            {message.status === "cancelled" && (
                <Text size="xs" tone="muted">
                    Stopped
                </Text>
            )}
            {message.status === "error" && (
                <Alert intent="danger" title="Response interrupted">
                    {message.error ||
                        `${assistantName} could not finish this response.`}
                </Alert>
            )}
            {canRetry && (
                <Button
                    type="button"
                    size="sm"
                    onClick={onRetry}
                    className="self-start"
                >
                    Retry
                </Button>
            )}
        </article>
    );
}

function AgentPicker({
    agents,
    selectedAgentId,
    isLoading,
    disabled,
    onSelectAgent,
}: {
    agents: AgentChoice[];
    selectedAgentId: string | null;
    isLoading: boolean;
    disabled: boolean;
    onSelectAgent: (agentId: string) => void;
}) {
    const selected = agents.find((agent) => agent.id === selectedAgentId);

    return (
        <div className="flex min-w-0 items-center gap-3">
            <Text as="span" size="sm" weight="bold" className="shrink-0">
                Agent
            </Text>
            <Dropdown
                className="w-max max-w-[calc(100vw-2rem)] p-2"
                panelStyle={routingThemeStyle()}
                trigger={(open) => (
                    <Button
                        type="button"
                        disabled={disabled || agents.length === 0}
                        className="w-fit max-w-full self-start justify-between gap-2"
                        aria-label={`Agent: ${selected?.title ?? "Unavailable"}`}
                    >
                        <RobotIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                            {isLoading && agents.length === 0
                                ? "Loading agents…"
                                : (selected?.title ?? "No agents available")}
                        </span>
                        <ChevronIcon expanded={open} />
                    </Button>
                )}
            >
                {(close) => (
                    <ScrollArea className="max-h-80 pr-2">
                        <div className="flex flex-col gap-1">
                            {agents.map((agent) => (
                                <TabButton
                                    key={agent.id}
                                    active={agent.id === selectedAgentId}
                                    size="sm"
                                    variant="ghost"
                                    className="w-full justify-start gap-2 text-left"
                                    onClick={() => {
                                        onSelectAgent(agent.id);
                                        close();
                                    }}
                                >
                                    <RobotIcon className="h-4 w-4 shrink-0" />
                                    <span className="truncate">
                                        {agent.title}
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

function RoutingSelector({
    field,
    value,
    choices,
    disabled,
    onChange,
}: {
    field: ChatRoutingCapability;
    value: string | null;
    choices: RoutingChoice[];
    disabled: boolean;
    onChange: (model: string | null) => void;
}) {
    const selected = choices.find((choice) => choice.id === value);
    const themeStyle = routingThemeStyle();
    return (
        <div className="flex min-w-0 items-center gap-2">
            <Text
                as="span"
                size="xs"
                tone="muted"
                weight="bold"
                className="shrink-0"
            >
                {ROUTING_LABELS[field]}
            </Text>
            <Dropdown
                className="w-max max-w-[calc(100vw-2rem)] p-2"
                panelStyle={themeStyle}
                trigger={(open) => (
                    <Button
                        type="button"
                        size="sm"
                        intent={value === null ? "neutral" : undefined}
                        disabled={disabled}
                        data-theme={value === null ? "neutral" : undefined}
                        data-customized={value !== null}
                        style={value === null ? undefined : themeStyle}
                        className="play-routing-value w-fit max-w-full justify-between gap-2"
                        aria-label={`${ROUTING_LABELS[field]} routing: ${selected?.title ?? "Auto"}`}
                    >
                        <span className="truncate">
                            {selected?.title ?? "Auto"}
                        </span>
                        <ChevronIcon expanded={open} />
                    </Button>
                )}
            >
                {(close) => (
                    <ScrollArea className="max-h-72 pr-2">
                        <div className="flex flex-col gap-1">
                            <TabButton
                                data-theme="neutral"
                                active={value === null}
                                size="sm"
                                variant="ghost"
                                className="w-full justify-start text-left"
                                onClick={() => {
                                    onChange(null);
                                    close();
                                }}
                            >
                                Auto
                            </TabButton>
                            {choices.map((choice) => (
                                <TabButton
                                    key={choice.id}
                                    active={choice.id === value}
                                    size="sm"
                                    variant="ghost"
                                    className="w-full justify-start text-left"
                                    onClick={() => {
                                        onChange(choice.id);
                                        close();
                                    }}
                                >
                                    <span className="truncate">
                                        {choice.title}
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

function RoutingPanel({
    selection,
    choices,
    disabled,
    onChange,
}: {
    selection: RoutingSelection;
    choices: Record<ChatRoutingCapability, RoutingChoice[]>;
    disabled: boolean;
    onChange: (field: ChatRoutingCapability, model: string | null) => void;
}) {
    return (
        <div
            id="play-chat-routing"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
            {CHAT_ROUTING_FIELDS.map((field) => (
                <RoutingSelector
                    key={field}
                    field={field}
                    value={selection[field]}
                    choices={choices[field]}
                    disabled={disabled}
                    onChange={(model) => onChange(field, model)}
                />
            ))}
        </div>
    );
}

export function Chat() {
    const { apiKey, isLoggedIn, isHydrated } = useAuthState();
    const { login } = useAuthActions();
    const catalog = useModelCatalog({
        baseUrl: API_BASE_URL,
        enabled: isHydrated,
    });
    const agents = useMemo(
        () => agentChoices(catalog.models),
        [catalog.models],
    );
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ConversationMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [routing, setRouting] = useState<RoutingSelection>(AUTO_ROUTING);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState("Ready");
    const abortRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef<string | null>(null);
    const transcriptRef = useRef<HTMLDivElement | null>(null);
    const followOutputRef = useRef(true);
    const composerRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const selectedAgent =
        agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
    const assistantName = selectedAgent?.title ?? "Agent";
    const selectedWelcome = useMemo(
        () => (selectedAgent ? welcomeMessage(selectedAgent) : null),
        [selectedAgent],
    );
    const acceptedAttachmentKinds = attachmentKinds(selectedAgent);
    const attachmentAccept = [...acceptedAttachmentKinds]
        .map((kind) => ATTACHMENT_ACCEPT[kind])
        .join(",");
    const supportsAttachments = acceptedAttachmentKinds.size > 0;

    const client = useMemo(
        () =>
            apiKey ? new Pollinations({ apiKey, baseUrl: API_BASE_URL }) : null,
        [apiKey],
    );
    const modelChoices = useMemo(
        () =>
            Object.fromEntries(
                CHAT_ROUTING_FIELDS.map((field) => [
                    field,
                    routingChoices(
                        catalog.models,
                        catalog.allowedModelIds,
                        field,
                    ),
                ]),
            ) as Record<ChatRoutingCapability, RoutingChoice[]>,
        [catalog.models, catalog.allowedModelIds],
    );

    useEffect(() => () => abortRef.current?.abort(), []);
    useEffect(() => {
        setRouting((current) => {
            const next = { ...current };
            for (const field of CHAT_ROUTING_FIELDS) {
                if (
                    next[field] &&
                    !modelChoices[field].some(
                        (choice) => choice.id === next[field],
                    )
                )
                    next[field] = null;
            }
            return next;
        });
    }, [modelChoices]);
    useEffect(() => {
        if (messages.length === 0) return;
        const transcript = transcriptRef.current;
        if (transcript && followOutputRef.current)
            transcript.scrollTop = transcript.scrollHeight;
    }, [messages]);
    useEffect(() => {
        if (!isLoggedIn) abortRef.current?.abort();
    }, [isLoggedIn]);
    useEffect(() => {
        if (!advancedOpen) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setAdvancedOpen(false);
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [advancedOpen]);

    async function streamAssistant(
        history: ConversationMessage[],
        assistantId: string,
        controller: AbortController,
    ) {
        if (!client || !selectedAgent) return;
        let accumulated = "";
        try {
            for await (const chunk of client.chatStream(
                conversationForRequest(history),
                {
                    model: selectedAgent.id,
                    routing:
                        selectedAgent.id === FLORET_MODEL_ID
                            ? compactRouting(routing)
                            : undefined,
                    signal: controller.signal,
                },
            )) {
                const delta = chunk.choices[0]?.delta?.content;
                if (!delta || requestIdRef.current !== assistantId) continue;
                accumulated += delta;
                setMessages((current) =>
                    current.map((message) =>
                        message.id === assistantId
                            ? { ...message, content: accumulated }
                            : message,
                    ),
                );
            }
            const agentError = accumulated
                .trim()
                .match(/^\[error:\s*(.+)]$/s)?.[1];
            setMessages((current) =>
                current.map((message) =>
                    message.id === assistantId
                        ? {
                              ...message,
                              status: agentError ? "error" : "complete",
                              error: agentError,
                          }
                        : message,
                ),
            );
            setStatus(agentError ? "Response failed" : "Response complete");
        } catch (caught) {
            const cancelled = isCancellation(caught);
            setMessages((current) =>
                current.flatMap((message) => {
                    if (message.id !== assistantId) return [message];
                    if (cancelled && !textContent(message)) return [];
                    return [
                        {
                            ...message,
                            status: cancelled ? "cancelled" : "error",
                            error: cancelled ? undefined : errorMessage(caught),
                        },
                    ];
                }),
            );
            if (!cancelled) setStatus("Response failed");
            else setStatus("Stopped");
        }
    }

    async function runHistory(
        history: ConversationMessage[],
        assistantId: string,
    ) {
        const controller = new AbortController();
        abortRef.current = controller;
        requestIdRef.current = assistantId;
        setSending(true);
        setStatus(`${assistantName} is responding`);
        await streamAssistant(history, assistantId, controller);
        if (requestIdRef.current === assistantId) {
            abortRef.current = null;
            requestIdRef.current = null;
            setSending(false);
            composerRef.current?.focus();
        }
    }

    async function send() {
        if (sending || !isHydrated) return;
        if (!isLoggedIn || !client) {
            login();
            return;
        }
        if (!selectedAgent) {
            setError("Select an agent first.");
            return;
        }
        if (!draft.trim() && files.length === 0) return;
        const controller = new AbortController();
        abortRef.current = controller;
        setSending(true);
        setError(null);
        setStatus(files.length ? "Uploading attachments" : "Preparing message");
        try {
            const attachments = await Promise.all(
                files.map((file) =>
                    prepareAttachment(client, file, controller.signal),
                ),
            );
            const userMessage: ConversationMessage = {
                id: crypto.randomUUID(),
                role: "user",
                content: buildUserContent(
                    draft,
                    attachments.map((attachment) => attachment.contentPart),
                ),
                status: "complete",
                attachments,
            };
            const assistant: ConversationMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: "",
                status: "streaming",
                attachments: [],
            };
            const history = [...messages, userMessage];
            setMessages([...history, assistant]);
            setDraft("");
            setFiles([]);
            followOutputRef.current = true;
            await runHistory(history, assistant.id);
        } catch (caught) {
            if (!isCancellation(caught)) setError(errorMessage(caught));
            setSending(false);
            abortRef.current = null;
            requestIdRef.current = null;
            setStatus(isCancellation(caught) ? "Stopped" : "Upload failed");
        }
    }

    async function retry(assistantId: string) {
        if (sending) return;
        const assistantIndex = messages.findIndex(
            (message) => message.id === assistantId,
        );
        if (assistantIndex < 1) return;
        const history = messages.slice(0, assistantIndex);
        const replacement: ConversationMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            status: "streaming",
            attachments: [],
        };
        setMessages([...history, replacement]);
        followOutputRef.current = true;
        await runHistory(history, replacement.id);
    }

    const canAttach =
        supportsAttachments && isHydrated && isLoggedIn && !sending;

    function handleFiles(nextFiles: File[]) {
        const accepted: File[] = [];
        const problems: string[] = [];

        if (nextFiles.length > MAX_ATTACHMENTS) {
            problems.push(`You can attach up to ${MAX_ATTACHMENTS} files.`);
        }
        for (const file of nextFiles.slice(0, MAX_ATTACHMENTS)) {
            if (file.size > MAX_ATTACHMENT_BYTES) {
                problems.push(`${file.name} is larger than 20 MB.`);
            } else if (!acceptedAttachmentKinds.has(fileKind(file))) {
                problems.push(
                    `${file.name} is not supported by ${assistantName}.`,
                );
            } else if (fileKind(file) === "audio" && !audioFormat(file)) {
                problems.push(`${file.name} uses an unsupported audio format.`);
            } else {
                accepted.push(file);
            }
        }

        setFiles(accepted);
        setError(problems.length > 0 ? problems.join(" ") : null);
    }

    function addFiles(nextFiles: File[]) {
        if (!canAttach || nextFiles.length === 0) return;
        handleFiles([...files, ...nextFiles]);
    }

    function onComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
        const pastedFiles = Array.from(event.clipboardData.files);
        if (!canAttach || pastedFiles.length === 0) return;
        event.preventDefault();
        addFiles(pastedFiles);
    }

    function onComposerDrop(event: DragEvent<HTMLFieldSetElement>) {
        event.preventDefault();
        if (!canAttach) return;
        addFiles(Array.from(event.dataTransfer.files));
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        void send();
    }
    function onComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
        ) {
            event.preventDefault();
            void send();
        }
    }

    const canRetryLast = (id: string) =>
        messages[messages.length - 1]?.id === id && !sending;
    const routingOverrideCount = CHAT_ROUTING_FIELDS.filter(
        (field) => routing[field] !== null,
    ).length;

    function selectAgent(agentId: string) {
        if (agentId === selectedAgentId) return;
        setSelectedAgentId(agentId);
        setMessages([]);
        setFiles([]);
        setError(null);
        setAdvancedOpen(false);
        setStatus("Ready");
        composerRef.current?.focus();
    }

    return (
        <section className="min-w-0" aria-label={`${assistantName} chat`}>
            <div className="play-chat-window flex min-h-0 flex-col">
                <div className="px-3 pt-4 pb-3 sm:px-5">
                    <AgentPicker
                        agents={agents}
                        selectedAgentId={selectedAgent?.id ?? null}
                        isLoading={catalog.isLoading}
                        disabled={sending}
                        onSelectAgent={selectAgent}
                    />
                </div>
                <ScrollArea
                    ref={transcriptRef}
                    className="play-chat-transcript min-h-0 flex-1 px-3 py-4 sm:px-5"
                    aria-label="Conversation"
                    aria-live="polite"
                    aria-busy={sending}
                    onScroll={(event) => {
                        const target = event.currentTarget;
                        followOutputRef.current =
                            target.scrollHeight -
                                target.scrollTop -
                                target.clientHeight <
                            96;
                    }}
                >
                    <div className="flex flex-col gap-5">
                        {selectedWelcome && (
                            <MessageCard
                                message={selectedWelcome}
                                assistantName={assistantName}
                                canRetry={false}
                                onRetry={() => undefined}
                            />
                        )}
                        {messages.map((message) => (
                            <MessageCard
                                key={message.id}
                                message={message}
                                assistantName={assistantName}
                                canRetry={
                                    canRetryLast(message.id) &&
                                    (message.status === "error" ||
                                        message.status === "cancelled")
                                }
                                onRetry={() => void retry(message.id)}
                            />
                        ))}
                    </div>
                </ScrollArea>
                <form
                    onSubmit={submit}
                    className="relative flex shrink-0 flex-col gap-3 p-3 sm:p-4"
                >
                    {catalog.error && (
                        <Alert intent="warning" title="Agent list unavailable">
                            <div className="flex flex-wrap items-center gap-2">
                                <span>
                                    The model catalog could not be refreshed.
                                </span>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => void catalog.refresh()}
                                >
                                    Retry catalog
                                </Button>
                            </div>
                        </Alert>
                    )}
                    {error && (
                        <Alert intent="danger" title="Could not send">
                            {error}
                        </Alert>
                    )}

                    <fieldset
                        className="play-chat-input m-0 min-w-0 p-0"
                        aria-label="Message and attachments"
                        onDragOver={(event) => {
                            event.preventDefault();
                            if (canAttach)
                                event.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={onComposerDrop}
                    >
                        <FileUpload
                            value={files}
                            onChange={handleFiles}
                            onReject={(rejected) => {
                                const problems = new Set(
                                    rejected.map(({ file, reason }) => {
                                        if (reason === "count")
                                            return `You can attach up to ${MAX_ATTACHMENTS} files.`;
                                        if (reason === "size")
                                            return `${file.name} is larger than 20 MB.`;
                                        return `${file.name} is not a supported file type.`;
                                    }),
                                );
                                setError([...problems].join(" "));
                            }}
                            maxFiles={MAX_ATTACHMENTS}
                            maxSizeBytes={MAX_ATTACHMENT_BYTES}
                            accept={attachmentAccept}
                            variant="inline"
                            disabled={!canAttach}
                            className="px-3 pt-3"
                            previewIcon={<ImageIcon className="h-5 w-5" />}
                        />
                        <Textarea
                            aria-label="Message"
                            ref={composerRef}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={onComposerKeyDown}
                            onPaste={onComposerPaste}
                            disabled={!isHydrated || sending}
                            placeholder={`Message ${assistantName}…`}
                            rows={3}
                            className="resize-none"
                        />
                    </fieldset>
                    <div className="flex flex-wrap items-end gap-2">
                        {selectedAgent?.id === FLORET_MODEL_ID && (
                            <TabButton
                                type="button"
                                active={advancedOpen}
                                intent="neutral"
                                size="lg"
                                disabled={sending}
                                aria-expanded={advancedOpen}
                                aria-controls="play-chat-routing"
                                ariaLabel={`Routing, ${routingOverrideCount > 0 ? `${routingOverrideCount} customized` : "Auto"}`}
                                onClick={() => setAdvancedOpen((open) => !open)}
                                className="play-routing-toggle h-12 gap-2"
                            >
                                <BeakerIcon className="h-5 w-5" />
                                <Chip
                                    size="sm"
                                    aria-label={
                                        routingOverrideCount > 0
                                            ? `${routingOverrideCount} routes customized`
                                            : "Automatic routing"
                                    }
                                    className="play-routing-badge min-w-6 justify-center px-1.5"
                                >
                                    {routingOverrideCount > 0
                                        ? routingOverrideCount
                                        : "Auto"}
                                </Chip>
                                <ChevronIcon
                                    expanded={advancedOpen}
                                    className="h-4 w-4"
                                />
                            </TabButton>
                        )}
                        <span className="inline-flex">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={attachmentAccept}
                                multiple
                                hidden
                                onChange={(event) => {
                                    addFiles(
                                        Array.from(
                                            event.currentTarget.files ?? [],
                                        ),
                                    );
                                    event.currentTarget.value = "";
                                }}
                            />
                            <Button
                                type="button"
                                size="lg"
                                intent="info"
                                aria-label="Add media"
                                title={
                                    !supportsAttachments
                                        ? `${assistantName} accepts text only`
                                        : isLoggedIn
                                          ? "Add media"
                                          : "Connect to add media"
                                }
                                disabled={
                                    !canAttach ||
                                    files.length >= MAX_ATTACHMENTS
                                }
                                className="h-12 w-12 shrink-0 p-0"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <CloudUploadIcon className="h-5 w-5 text-theme-text-strong" />
                            </Button>
                        </span>
                        {(!isHydrated || sending) && (
                            <Text size="xs" tone="muted" aria-live="polite">
                                {!isHydrated
                                    ? "Checking your session…"
                                    : status}
                            </Text>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                            {messages.length > 0 && (
                                <Button
                                    intent="danger"
                                    size="lg"
                                    aria-label="New chat"
                                    title="New chat"
                                    className="h-12 w-12 shrink-0 p-0"
                                    onClick={() => {
                                        abortRef.current?.abort();
                                        setMessages([]);
                                        setDraft("");
                                        setFiles([]);
                                        setError(null);
                                        setStatus("Ready");
                                        composerRef.current?.focus();
                                    }}
                                >
                                    <TrashIcon className="h-5 w-5" />
                                </Button>
                            )}
                            {sending ? (
                                <Button
                                    intent="danger"
                                    size="lg"
                                    type="button"
                                    onClick={() => abortRef.current?.abort()}
                                >
                                    Stop
                                </Button>
                            ) : !isHydrated ? (
                                <Button
                                    size="lg"
                                    disabled
                                    aria-label="Loading account"
                                >
                                    Checking…
                                </Button>
                            ) : !isLoggedIn ? (
                                <Button
                                    size="lg"
                                    type="button"
                                    onClick={() => login()}
                                >
                                    <ChatIcon className="mr-2 h-4 w-4" />
                                    Connect to chat
                                </Button>
                            ) : (
                                <Button
                                    size="lg"
                                    type="submit"
                                    disabled={
                                        !selectedAgent ||
                                        (!draft.trim() && files.length === 0)
                                    }
                                >
                                    <RocketIcon className="mr-2 h-4 w-4" />
                                    Send
                                </Button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
            {advancedOpen && selectedAgent?.id === FLORET_MODEL_ID && (
                <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                    <RoutingPanel
                        selection={routing}
                        choices={modelChoices}
                        disabled={!isLoggedIn || catalog.isLoading || sending}
                        onChange={(field, model) =>
                            setRouting((current) => ({
                                ...current,
                                [field]: model,
                            }))
                        }
                    />
                </div>
            )}
        </section>
    );
}

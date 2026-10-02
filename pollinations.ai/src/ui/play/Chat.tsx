import { useChat } from "@ai-sdk/react";
import { Pollinations } from "@pollinations/sdk";
import {
    type UseModelCatalogValue,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import {
    Alert,
    Button,
    ChatConversation,
    ChatConversationContent,
    ChatIcon,
    ChatMessage,
    ChatMessageActions,
    ChatMessageContent,
    ChatPromptInput,
    ChatPromptInputFooter,
    ChatPromptTextarea,
    CheckIcon,
    ChevronIcon,
    ClipboardIcon,
    CloudUploadIcon,
    CopyButton,
    cn,
    Dropdown,
    FileUpload,
    ImageIcon,
    RocketIcon,
    ScrollArea,
    TabButton,
    Text,
    ToolCallDetails,
    TrashIcon,
    XIcon,
} from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
import type { DynamicToolUIPart, FileUIPart } from "ai";
import {
    type ClipboardEvent,
    type DragEvent,
    type FormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { API_BASE_URL } from "../../config";
import type { PlaySearch } from "../../routes/-play-search";
import {
    type AgentChoice,
    agentChoices,
    errorMessage,
    FLORET_MODEL_ID,
    isCancellation,
    selectedAgentChoice,
} from "./chat-models";
import {
    type PollinationsUIMessage,
    pollinationsChatTransport,
} from "./pollinations-chat-transport";
import { UploadPrivacyNote } from "./UploadPrivacyNote";

const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function welcomeMessage(agent: AgentChoice): PollinationsUIMessage {
    return {
        id: `${agent.id}-welcome`,
        role: "assistant",
        parts: [
            {
                type: "text",
                text:
                    agent.id === FLORET_MODEL_ID
                        ? "👋 Hi, I’m Floret — an AI agent. That means I can combine several tasks in one conversation: chat, search, and create text, images, video, or audio. What would you like to make? ✨"
                        : `👋 You’re chatting with ${agent.title}. What would you like help with?`,
            },
        ],
    };
}

async function attachmentFile(
    client: Pollinations,
    file: File,
    signal: AbortSignal,
): Promise<FileUIPart> {
    const upload = await client.upload(file, { name: file.name, signal });
    return {
        type: "file",
        mediaType: upload.contentType || file.type,
        filename: file.name,
        url: upload.url,
    };
}

/** Files are the user's images or media an agent generated. */
function AttachmentView({ file }: { file: FileUIPart }) {
    const name = file.filename ?? "Generated media";
    if (file.mediaType.startsWith("image/")) {
        return (
            <a href={file.url} target="_blank" rel="noopener noreferrer">
                <img
                    src={file.url}
                    alt={name}
                    loading="lazy"
                    className="play-chat-media rounded-lg"
                />
            </a>
        );
    }
    if (file.mediaType.startsWith("video/")) {
        return (
            <>
                {/* biome-ignore lint/a11y/useMediaCaption: Generated media has no caption track. */}
                <video
                    src={file.url}
                    controls
                    preload="metadata"
                    className="play-chat-media rounded-lg"
                />
            </>
        );
    }
    return (
        <>
            {/* biome-ignore lint/a11y/useMediaCaption: Generated media has no caption track. */}
            <audio
                src={file.url}
                controls
                preload="metadata"
                className="max-w-full"
            />
        </>
    );
}

const TOOL_STATUS = {
    "input-streaming": "running",
    "input-available": "running",
    "approval-requested": "approval-requested",
    "approval-responded": "approval-responded",
    "output-available": "complete",
    "output-error": "error",
    "output-denied": "denied",
} as const satisfies Record<DynamicToolUIPart["state"], string>;

function activeTool(message: PollinationsUIMessage): string | undefined {
    const names = message.parts.flatMap((part) =>
        part.type === "dynamic-tool" && part.state === "input-available"
            ? [part.toolName]
            : [],
    );
    return names[names.length - 1];
}

export function MessageCard({
    message,
    assistantName,
    isStreaming,
    responseError,
    canRetry,
    onRetry,
}: {
    message: PollinationsUIMessage;
    assistantName: string;
    isStreaming: boolean;
    responseError?: Error;
    canRetry: boolean;
    onRetry: () => void;
}) {
    const isUser = message.role === "user";
    const files = message.parts.filter((part) => part.type === "file");
    const texts = message.parts.flatMap((part) =>
        part.type === "text" && part.text.trim() ? [part.text.trim()] : [],
    );
    const contentParts = isUser
        ? []
        : message.parts.filter(
              (part) =>
                  (part.type === "text" && part.text.trim()) ||
                  part.type === "dynamic-tool" ||
                  part.type === "file",
          );
    const cancelled = message.parts.some(
        (part) => part.type === "data-responseStatus",
    );
    const retryable = canRetry && (cancelled || Boolean(responseError));
    const activity = activeTool(message);
    const copyText = isUser ? "" : texts.join("\n\n");
    const showArticle =
        isUser ||
        contentParts.length > 0 ||
        isStreaming ||
        cancelled ||
        responseError;

    return (
        <div
            className={cn(
                "play-chat-message flex min-w-0 flex-col gap-3",
                isUser ? "ml-auto items-end" : "mr-auto items-start",
            )}
            aria-busy={isStreaming}
        >
            {showArticle && (
                <ChatMessage
                    from={isUser ? "user" : "assistant"}
                    className="max-w-full"
                    aria-label={
                        isUser ? "Your message" : `${assistantName} message`
                    }
                >
                    <ChatMessageContent className="flex flex-col gap-3">
                        {isUser && texts.length > 0 && (
                            <p className="whitespace-pre-wrap break-words">
                                {texts.join("\n")}
                            </p>
                        )}
                        {contentParts.map((part, index) =>
                            part.type === "dynamic-tool" ? (
                                <ToolCallDetails
                                    key={part.toolCallId}
                                    name={part.toolName}
                                    input={part.input}
                                    output={part.output}
                                    error={part.errorText}
                                    status={TOOL_STATUS[part.state]}
                                />
                            ) : part.type === "file" ? (
                                <AttachmentView
                                    // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder within a message
                                    key={`file:${index}`}
                                    file={part}
                                />
                            ) : part.type === "text" ? (
                                <Markdown
                                    // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder within a message
                                    key={`text:${index}`}
                                >
                                    {part.text}
                                </Markdown>
                            ) : null,
                        )}
                        {isUser && files.length > 0 && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {files.map((file, index) => (
                                    <AttachmentView
                                        // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder within a message
                                        key={`file:${index}`}
                                        file={file}
                                    />
                                ))}
                            </div>
                        )}
                        {isStreaming && (
                            <Text
                                size="sm"
                                tone="muted"
                                className="animate-pulse"
                            >
                                {activity || "Working…"}
                            </Text>
                        )}
                        {cancelled && (
                            <Text size="xs" tone="muted">
                                Stopped
                            </Text>
                        )}
                        {responseError && (
                            <Alert intent="danger" title="Response interrupted">
                                {responseError.message ||
                                    `${assistantName} could not finish this response.`}
                            </Alert>
                        )}
                    </ChatMessageContent>
                    {!isUser && (copyText || retryable) && (
                        <ChatMessageActions>
                            {copyText && (
                                <CopyButton
                                    value={copyText}
                                    tooltip={null}
                                    aria-label="Copy response"
                                    className="flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-xs text-theme-text-soft hover:bg-theme-bg-hover hover:text-theme-text-strong"
                                >
                                    {(copied) => (
                                        <>
                                            {copied ? (
                                                <CheckIcon className="size-3.5" />
                                            ) : (
                                                <ClipboardIcon className="size-3.5" />
                                            )}
                                            {copied ? "Copied" : "Copy"}
                                        </>
                                    )}
                                </CopyButton>
                            )}
                            {retryable && (
                                <Button
                                    type="button"
                                    size="xs"
                                    onClick={onRetry}
                                >
                                    Retry
                                </Button>
                            )}
                        </ChatMessageActions>
                    )}
                </ChatMessage>
            )}
        </div>
    );
}

function AgentPicker({
    agents,
    selectedAgentId,
    isLoading,
    disabled,
    onSelectAgent,
    onClearChat,
}: {
    agents: AgentChoice[];
    selectedAgentId: string | null;
    isLoading: boolean;
    disabled: boolean;
    onSelectAgent: (agentId: string) => void;
    onClearChat?: () => void;
}) {
    const selected = agents.find((agent) => agent.id === selectedAgentId);
    const label =
        isLoading && agents.length === 0
            ? "Loading agents…"
            : (selected?.title ??
              (agents.length > 0 ? "Choose an agent" : "No agents available"));

    return (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <Text as="span" size="sm" weight="bold" className="shrink-0">
                Agent
            </Text>
            <Dropdown
                className="w-max max-w-[calc(100vw-2rem)] p-2"
                trigger={(open) => (
                    <Button
                        type="button"
                        disabled={disabled || agents.length === 0}
                        className="w-fit max-w-full self-start justify-between gap-2"
                        aria-label={`Agent: ${label}`}
                    >
                        <span className="truncate">{label}</span>
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
                                    className="w-full justify-start text-left"
                                    onClick={() => {
                                        onSelectAgent(agent.id);
                                        close();
                                    }}
                                >
                                    <span className="truncate">
                                        {agent.title}
                                    </span>
                                </TabButton>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </Dropdown>
            {onClearChat && (
                <button
                    type="button"
                    className="polli-control inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-transparent px-2 py-1 text-sm text-theme-text-muted hover:text-theme-text-strong"
                    onClick={onClearChat}
                >
                    <TrashIcon className="h-4 w-4" />
                    Clear chat
                </button>
            )}
        </div>
    );
}

export function Chat({
    catalog,
    active,
    initialAgentId = null,
    initialDraft = "",
    onDraftChange,
}: {
    catalog: UseModelCatalogValue;
    active: boolean;
    initialAgentId?: string | null;
    initialDraft?: string;
    /** Receives the agent and message while this tab is visible. */
    onDraftChange?: (search: PlaySearch) => void;
}) {
    const { apiKey, isLoggedIn, isHydrated } = useAuthState();
    const { login } = useAuthActions();
    const agents = useMemo(
        () => agentChoices(catalog.models),
        [catalog.models],
    );
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
        initialAgentId,
    );
    const [draft, setDraft] = useState(initialDraft);
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const uploadAbortRef = useRef<AbortController | null>(null);
    const activeAgentRef = useRef<string | null>(null);
    const transcriptRef = useRef<HTMLDivElement | null>(null);
    const followOutputRef = useRef(true);
    const composerRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const selectedAgent = selectedAgentChoice(agents, selectedAgentId);
    const assistantName = selectedAgent?.title ?? "Agent";
    const supportsAttachments =
        selectedAgent?.inputModalities.includes("image") ?? false;

    const client = useMemo(
        () =>
            apiKey ? new Pollinations({ apiKey, baseUrl: API_BASE_URL }) : null,
        [apiKey],
    );
    const transport = useMemo(
        () =>
            pollinationsChatTransport({
                apiKey,
                model: selectedAgent?.id ?? null,
            }),
        [apiKey, selectedAgent?.id],
    );
    const {
        messages,
        setMessages,
        sendMessage,
        regenerate,
        stop,
        status,
        error: responseError,
        clearError,
    } = useChat<PollinationsUIMessage>({
        id: "pollinations-play-agent-chat",
        transport,
        // Each update re-renders the reply's Markdown, so cap the render rate.
        throttle: 50,
    });
    const streaming = status === "submitted" || status === "streaming";
    const sending = uploading || streaming;
    useEffect(() => {
        if (active)
            onDraftChange?.({
                agent: selectedAgentId ?? undefined,
                message: draft,
            });
    }, [active, selectedAgentId, draft, onDraftChange]);

    useEffect(
        () => () => {
            uploadAbortRef.current?.abort();
            void stop();
        },
        [stop],
    );
    useEffect(() => {
        if (!selectedAgent) {
            uploadAbortRef.current?.abort();
            void stop();
            return;
        }
        if (activeAgentRef.current === selectedAgent.id) return;
        const switchingAgent = activeAgentRef.current !== null;
        activeAgentRef.current = selectedAgent.id;
        uploadAbortRef.current?.abort();
        void stop();
        setMessages([]);
        if (switchingAgent) {
            setDraft("");
            setFiles([]);
        }
        setLocalError(null);
        clearError();
    }, [selectedAgent, setMessages, stop, clearError]);
    useEffect(() => {
        if (messages.length === 0) return;
        const transcript = transcriptRef.current;
        if (transcript && followOutputRef.current) {
            transcript.scrollTop = transcript.scrollHeight;
            setShowScrollButton(false);
        }
    }, [messages]);
    useEffect(() => {
        if (isLoggedIn && active) return;
        uploadAbortRef.current?.abort();
        void stop();
        for (const media of transcriptRef.current?.querySelectorAll<HTMLMediaElement>(
            "audio, video",
        ) ?? [])
            media.pause();
    }, [isLoggedIn, active, stop]);
    async function send() {
        if (sending || !isHydrated || !active) return;
        if (!isLoggedIn || !client) {
            login();
            return;
        }
        if (!draft.trim() && files.length === 0) return;
        const controller = new AbortController();
        uploadAbortRef.current = controller;
        setUploading(true);
        setLocalError(null);
        clearError();
        try {
            const fileParts = await Promise.all(
                files.map((file) =>
                    attachmentFile(client, file, controller.signal),
                ),
            );
            controller.signal.throwIfAborted();
            setDraft("");
            setFiles([]);
            followOutputRef.current = true;
            setUploading(false);
            uploadAbortRef.current = null;
            const text = draft.trim();
            await sendMessage(
                text ? { text, files: fileParts } : { files: fileParts },
            );
            composerRef.current?.focus();
        } catch (caught) {
            if (!isCancellation(caught)) setLocalError(errorMessage(caught));
        } finally {
            if (uploadAbortRef.current === controller)
                uploadAbortRef.current = null;
            setUploading(false);
        }
    }

    async function retry(assistantId: string) {
        if (sending) return;
        clearError();
        followOutputRef.current = true;
        await regenerate({ messageId: assistantId });
        composerRef.current?.focus();
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
            } else if (!file.type.startsWith("image/")) {
                problems.push(`${file.name} is not an image.`);
            } else {
                accepted.push(file);
            }
        }

        setFiles(accepted);
        setLocalError(problems.length > 0 ? problems.join(" ") : null);
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

    function selectAgent(agentId: string) {
        if (agentId === selectedAgentId) return;
        setSelectedAgentId(agentId);
        composerRef.current?.focus();
    }

    if (!selectedAgent) {
        return (
            <section
                hidden={!active}
                className="min-w-0"
                aria-label="Agent chat"
            >
                <div className="pt-6 pb-3">
                    <AgentPicker
                        agents={agents}
                        selectedAgentId={null}
                        isLoading={catalog.isLoading}
                        disabled={sending}
                        onSelectAgent={selectAgent}
                    />
                </div>
                <div
                    className="flex min-h-32 flex-col items-center justify-center gap-3 py-6 text-center"
                    aria-live="polite"
                >
                    <Text size="sm" tone="muted">
                        {catalog.isLoading
                            ? "Loading agents…"
                            : catalog.error
                              ? "Agents could not be loaded right now."
                              : agents.length === 0
                                ? "No agents are available right now."
                                : selectedAgentId === null ||
                                    selectedAgentId === FLORET_MODEL_ID
                                  ? "Floret is unavailable. Choose another agent to continue."
                                  : "Your selected agent is unavailable. Choose another agent to continue."}
                    </Text>
                    {catalog.error && (
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => void catalog.refresh()}
                        >
                            Retry catalog
                        </Button>
                    )}
                </div>
            </section>
        );
    }

    return (
        <section
            hidden={!active}
            className="min-w-0"
            aria-label={`${assistantName} chat`}
        >
            <div className="play-chat-window flex min-h-0 flex-col">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-6 pb-3">
                    <AgentPicker
                        agents={agents}
                        selectedAgentId={selectedAgent.id}
                        isLoading={catalog.isLoading}
                        disabled={sending}
                        onSelectAgent={selectAgent}
                        onClearChat={
                            messages.length > 0
                                ? () => {
                                      uploadAbortRef.current?.abort();
                                      void stop();
                                      setMessages([]);
                                      setDraft("");
                                      setFiles([]);
                                      setLocalError(null);
                                      clearError();
                                      composerRef.current?.focus();
                                  }
                                : undefined
                        }
                    />
                </div>
                <ChatConversation
                    ref={transcriptRef}
                    className="play-chat-conversation min-h-0 flex-1"
                    viewportClassName="play-chat-transcript py-3"
                    aria-label="Conversation"
                    aria-busy={sending}
                    showScrollButton={showScrollButton}
                    onScrollToBottom={() => {
                        const transcript = transcriptRef.current;
                        if (!transcript) return;
                        transcript.scrollTo({
                            top: transcript.scrollHeight,
                            behavior: "smooth",
                        });
                        followOutputRef.current = true;
                        setShowScrollButton(false);
                    }}
                    onScroll={(event) => {
                        const target = event.currentTarget;
                        const followsOutput =
                            target.scrollHeight -
                                target.scrollTop -
                                target.clientHeight <
                            96;
                        followOutputRef.current = followsOutput;
                        setShowScrollButton(!followsOutput);
                    }}
                >
                    <ChatConversationContent>
                        <MessageCard
                            message={welcomeMessage(selectedAgent)}
                            assistantName={assistantName}
                            isStreaming={false}
                            canRetry={false}
                            onRetry={() => {}}
                        />
                        {messages.map((message, index) => {
                            const isLast = index === messages.length - 1;
                            return (
                                <MessageCard
                                    key={message.id}
                                    message={message}
                                    assistantName={assistantName}
                                    isStreaming={
                                        isLast &&
                                        message.role === "assistant" &&
                                        streaming
                                    }
                                    responseError={
                                        isLast && message.role === "assistant"
                                            ? responseError
                                            : undefined
                                    }
                                    canRetry={
                                        isLast &&
                                        message.role === "assistant" &&
                                        !sending
                                    }
                                    onRetry={() => void retry(message.id)}
                                />
                            );
                        })}
                    </ChatConversationContent>
                </ChatConversation>
                <form
                    onSubmit={submit}
                    className="relative flex shrink-0 flex-col gap-3 pt-3"
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
                    {localError && (
                        <Alert intent="danger" title="Could not send">
                            {localError}
                        </Alert>
                    )}

                    <ChatPromptInput
                        aria-label="Message and attachments"
                        onDragOver={(event) => {
                            event.preventDefault();
                            if (canAttach)
                                event.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={onComposerDrop}
                    >
                        <div className="play-chat-composer-field rounded-lg">
                            <FileUpload
                                value={files}
                                onChange={handleFiles}
                                maxFiles={MAX_ATTACHMENTS}
                                maxSizeBytes={MAX_ATTACHMENT_BYTES}
                                accept="image/*"
                                variant="inline"
                                disabled={!canAttach}
                                className="play-chat-attachments px-3 pt-4 pb-1"
                                previewIcon={<ImageIcon className="h-5 w-5" />}
                            />
                            <ChatPromptTextarea
                                className="play-chat-draft"
                                aria-label="Message"
                                ref={composerRef}
                                value={draft}
                                onChange={(event) =>
                                    setDraft(event.target.value)
                                }
                                onKeyDown={onComposerKeyDown}
                                onPaste={onComposerPaste}
                                disabled={!isHydrated || sending}
                                placeholder={`Message ${assistantName}…`}
                                rows={3}
                            />
                        </div>
                        <ChatPromptInputFooter className="pt-2">
                            <span className="inline-flex">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
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
                                    aria-label="Add images"
                                    aria-describedby={
                                        files.length > 0
                                            ? "play-chat-upload-privacy"
                                            : undefined
                                    }
                                    title={
                                        !supportsAttachments
                                            ? `${assistantName} accepts text only`
                                            : isLoggedIn
                                              ? "Add images"
                                              : "Connect to add images"
                                    }
                                    disabled={
                                        !canAttach ||
                                        files.length >= MAX_ATTACHMENTS
                                    }
                                    className="h-12 w-12 shrink-0 p-0"
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                >
                                    <CloudUploadIcon className="h-5 w-5 text-theme-text-strong" />
                                </Button>
                            </span>
                            <div className="ml-auto flex items-center gap-2">
                                {sending ? (
                                    <Button
                                        intent="danger"
                                        size="lg"
                                        type="button"
                                        aria-label="Stop generation"
                                        title="Stop generation"
                                        className="h-12 w-12 shrink-0 p-0"
                                        onClick={() => {
                                            uploadAbortRef.current?.abort();
                                            void stop();
                                        }}
                                    >
                                        <XIcon className="h-5 w-5" />
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
                                            !draft.trim() && files.length === 0
                                        }
                                    >
                                        <RocketIcon className="mr-2 h-4 w-4" />
                                        Send
                                    </Button>
                                )}
                            </div>
                        </ChatPromptInputFooter>
                        <div className="space-y-1 pt-2">
                            <Text size="xs" tone="muted">
                                May use third-party models and tools. Don’t
                                share sensitive information.
                            </Text>
                            {files.length > 0 && (
                                <UploadPrivacyNote id="play-chat-upload-privacy" />
                            )}
                        </div>
                    </ChatPromptInput>
                </form>
            </div>
        </section>
    );
}

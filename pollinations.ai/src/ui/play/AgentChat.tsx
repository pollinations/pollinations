import {
    useAuthState,
    usePollinationsChatTransport,
} from "@pollinations/sdk/react";
import {
    Alert,
    Button,
    ChatConversation,
    ChatConversationContent,
    ChatMessage,
    ChatMessageActions,
    ChatMessageContent,
    ChatPromptInput,
    ChatPromptInputFooter,
    ChatPromptTextarea,
    ConfirmationDialog,
    CopyButton,
    CopyStateIcon,
    LoadingStatus,
    PlusIcon,
    RefreshIcon,
    ToolCallDetails,
    type ToolCallStatus,
    TrashIcon,
} from "@pollinations/ui";
import {
    Fragment,
    lazy,
    type ReactNode,
    Suspense,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    type AgentItem,
    type AgentToolCall,
    type AgentTurn,
    replyMedia,
    replyText,
    toolLabel,
    withoutMedia,
} from "./agent-turn";

// Loaded with the first reply, so the other tabs do not carry the parser.
const Markdown = lazy(() =>
    import("@pollinations/ui/markdown").then((module) => ({
        default: module.Markdown,
    })),
);

/** Draws one media link with the Playground's own result panel. */
type RenderMedia = (url: string) => ReactNode;

/** The conversation so far as chat messages; the last turn is the one to answer. */
function chatMessages(turns: AgentTurn[]) {
    return turns.flatMap((turn, index) => {
        const user = {
            role: "user",
            parts: [
                { type: "text", text: turn.prompt },
                ...(turn.images ?? []).map((image) => ({
                    type: "file",
                    ...image,
                })),
            ],
        };
        if (index === turns.length - 1) return [user];
        return [
            user,
            {
                role: "assistant",
                parts: [{ type: "text", text: replyText(turn) }],
                metadata: { output: turn.output },
            },
        ];
    });
}

/**
 * One in-memory conversation per agent, answered by a /v1/responses stream.
 * `upload` turns an attached image into the link the agent receives.
 */
export function useAgentChat(
    agent: string | undefined,
    upload: (file: File) => Promise<string>,
) {
    const transport = usePollinationsChatTransport({ model: agent });
    const [threads, setThreads] = useState<Record<string, AgentTurn[]>>({});
    const requests = useRef<Record<string, AbortController>>({});
    // Conversations belong to the signed-in account: they go when it changes.
    const { apiKey } = useAuthState();
    const [owner, setOwner] = useState(apiKey);
    if (owner !== apiKey) {
        setOwner(apiKey);
        setThreads({});
    }
    useEffect(
        () => () => {
            for (const request of Object.values(requests.current))
                request.abort();
            requests.current = {};
        },
        [apiKey],
    );

    const turns = (agent && threads[agent]) || [];
    const busy = turns[turns.length - 1]?.status === "running";

    async function start(agent: string, turns: AgentTurn[]) {
        const request = new AbortController();
        requests.current[agent] = request;
        const turn = turns[turns.length - 1];
        const items: AgentItem[] = [];
        // A run that was cleared or replaced must not write to the thread.
        const show = (patch: Partial<AgentTurn> = {}) => {
            if (requests.current[agent] !== request) return;
            setThreads((previous) => {
                const list = previous[agent] ?? [];
                const last = list[list.length - 1];
                if (!last) return previous;
                const next = {
                    ...last,
                    items: items.map((item) => ({ ...item })),
                    ...patch,
                };
                return { ...previous, [agent]: [...list.slice(0, -1), next] };
            });
        };
        const tool = (callId: string, name = "") => {
            let call = items.find(
                (item): item is AgentToolCall =>
                    item.type === "tool" && item.callId === callId,
            );
            if (!call) {
                call = { type: "tool", callId, name, arguments: undefined };
                items.push(call);
            }
            return call;
        };
        show({ status: "running", error: undefined, output: undefined });
        try {
            const images =
                turn.images ??
                (await Promise.all(
                    (turn.files ?? []).map(async (file) => ({
                        url: await upload(file),
                        mediaType: file.type,
                    })),
                ));
            show({ images });
            const stream = await transport.sendMessages({
                messages: chatMessages([
                    ...turns.slice(0, -1),
                    { ...turn, images },
                ]),
                abortSignal: request.signal,
                body: { model: agent },
            });
            const reader = stream.getReader();
            let text:
                | { id: string; item: AgentItem & { type: "text" } }
                | undefined;
            for (;;) {
                const { done, value: chunk } = await reader.read();
                if (done) break;
                if (chunk.type === "text-delta") {
                    if (text?.id !== chunk.id) {
                        text = {
                            id: chunk.id,
                            item: { type: "text", text: "" },
                        };
                        items.push(text.item);
                    }
                    text.item.text += chunk.delta;
                } else if (chunk.type === "tool-input-start") {
                    tool(chunk.toolCallId, chunk.toolName);
                } else if (chunk.type === "tool-input-available") {
                    tool(chunk.toolCallId, chunk.toolName).arguments =
                        chunk.input;
                } else if (chunk.type === "tool-output-available") {
                    tool(chunk.toolCallId).result = { output: chunk.output };
                } else if (chunk.type === "tool-output-error") {
                    tool(chunk.toolCallId).result = {
                        output: chunk.errorText,
                        isError: true,
                    };
                } else if (chunk.type === "error") {
                    return show({
                        status: "interrupted",
                        error: chunk.errorText,
                    });
                } else if (chunk.type === "finish") {
                    if (chunk.finishReason === "stop")
                        return show({
                            status: "done",
                            output: chunk.messageMetadata.output,
                        });
                    // A reply cut short keeps its text but is not replayed
                    // item by item: it may hold a call without its result.
                    return show({
                        status: "interrupted",
                        error:
                            chunk.finishReason === "length"
                                ? "The reply reached its limit before it was complete."
                                : "The reply was stopped by a content filter.",
                    });
                } else continue;
                show();
            }
            show({ status: "interrupted" });
        } catch (error) {
            show(
                request.signal.aborted
                    ? { status: "stopped" }
                    : {
                          status: "interrupted",
                          error:
                              error instanceof Error
                                  ? error.message
                                  : undefined,
                      },
            );
        }
    }

    return {
        turns,
        busy,
        send(prompt: string, files: File[] = []) {
            if (!agent || busy) return;
            const next: AgentTurn[] = [
                ...turns,
                {
                    id: crypto.randomUUID(),
                    prompt,
                    files,
                    items: [],
                    status: "running",
                },
            ];
            setThreads((previous) => ({ ...previous, [agent]: next }));
            void start(agent, next);
        },
        retry() {
            if (agent && !busy && turns.length) void start(agent, turns);
        },
        /** Stops showing the reply; the agent may still finish its run. */
        stop() {
            if (agent) requests.current[agent]?.abort();
        },
        clear() {
            if (!agent) return;
            requests.current[agent]?.abort();
            delete requests.current[agent];
            setThreads(({ [agent]: _cleared, ...rest }) => rest);
        },
    };
}

/**
 * Running until a result arrives or the reply ends. Completed is only for a
 * confirmed success: a call that never reports back keeps its name, no status.
 */
function toolStatus(
    call: AgentToolCall,
    turn: AgentTurn["status"],
): ToolCallStatus | null {
    if (call.result) return call.result.isError ? "error" : "complete";
    return turn === "running" ? "running" : null;
}

/** One reply: its tool calls and text in order, then its media. */
export function Reply({
    turn,
    onRetry,
    renderMedia,
}: {
    turn: AgentTurn;
    onRetry?: () => void;
    renderMedia: RenderMedia;
}) {
    const text = replyText(turn);
    const media = replyMedia(turn.items, turn.status !== "running");
    return (
        <ChatMessage from="assistant" className="w-full">
            {turn.items.map((item, index) =>
                item.type === "tool" ? (
                    <ToolCallDetails
                        key={item.callId}
                        name={item.name}
                        label={toolLabel(item.name)}
                        input={item.arguments}
                        {...(item.result?.isError
                            ? { error: item.result.output }
                            : { output: item.result?.output })}
                        status={toolStatus(item, turn.status)}
                    />
                ) : (
                    <ChatMessageContent key={index}>
                        <Suspense fallback={item.text}>
                            <Markdown media="links">
                                {withoutMedia(item.text, media)}
                            </Markdown>
                        </Suspense>
                    </ChatMessageContent>
                ),
            )}
            {media.map((url) => (
                <Fragment key={url}>{renderMedia(url)}</Fragment>
            ))}
            {turn.status === "running" && turn.items.length === 0 && (
                <LoadingStatus>Working…</LoadingStatus>
            )}
            {(turn.status === "interrupted" || turn.status === "stopped") && (
                <Alert
                    intent={turn.status === "interrupted" ? "danger" : "info"}
                >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                        {turn.status === "interrupted"
                            ? (turn.error ?? "The reply was interrupted.")
                            : "Reply stopped."}
                        {onRetry && (
                            <Button
                                size="sm"
                                intent="neutral"
                                icon={<RefreshIcon />}
                                onClick={onRetry}
                            >
                                Retry
                            </Button>
                        )}
                    </span>
                </Alert>
            )}
            {text && turn.status !== "running" && (
                <ChatMessageActions className="pt-0">
                    <CopyButton
                        value={text}
                        variant="button"
                        intent="neutral"
                        aria-label="Copy reply"
                        title="Copy reply"
                        className="polli:h-9 polli:w-9 polli:min-h-0 polli:p-0"
                    >
                        {(copied) => (
                            <CopyStateIcon copied={copied} className="size-4" />
                        )}
                    </CopyButton>
                </ChatMessageActions>
            )}
        </ChatMessage>
    );
}

/** The Agent tab's part of the input card: the conversation, then the composer. */
export function AgentChat({
    agentTitle,
    turns,
    busy,
    draft,
    onDraftChange,
    onSubmit,
    onRetry,
    onClear,
    attachments,
    renderMedia,
}: {
    renderMedia: RenderMedia;
    agentTitle: string;
    turns: AgentTurn[];
    busy: boolean;
    draft: string;
    onDraftChange: (value: string) => void;
    onSubmit: () => void;
    onRetry: () => void;
    onClear: () => void;
    /** The upload tile, when the agent accepts images. */
    attachments?: ReactNode;
}) {
    const [confirming, setConfirming] = useState(false);
    const transcript = useRef<HTMLDivElement>(null);
    const last = turns[turns.length - 1];
    // Follow the newest message as turns arrive and replies finish.
    useEffect(() => {
        const element = transcript.current;
        if (element) element.scrollTop = element.scrollHeight;
    }, [turns.length, last?.status]);

    return (
        <>
            {turns.length > 0 && (
                <section
                    aria-label={`Conversation with ${agentTitle}`}
                    className="flex min-w-0 flex-col gap-3"
                >
                    <ChatConversation
                        ref={transcript}
                        className="flex max-h-[min(70dvh,40rem)] flex-col"
                    >
                        <ChatConversationContent>
                            {turns.map((turn) => (
                                <Fragment key={turn.id}>
                                    <ChatMessage
                                        from="user"
                                        className="max-w-[88%] whitespace-pre-wrap"
                                    >
                                        {turn.images?.map(({ url }) => (
                                            <Fragment key={url}>
                                                {renderMedia(url)}
                                            </Fragment>
                                        ))}
                                        {turn.prompt}
                                    </ChatMessage>
                                    <Reply
                                        turn={turn}
                                        renderMedia={renderMedia}
                                        onRetry={
                                            turn === last ? onRetry : undefined
                                        }
                                    />
                                </Fragment>
                            ))}
                        </ChatConversationContent>
                    </ChatConversation>
                </section>
            )}
            <ChatPromptInput
                aria-label="Message"
                className="flex flex-col gap-3 border-0"
            >
                <ChatPromptTextarea
                    aria-label={`Message ${agentTitle}`}
                    placeholder={`Message ${agentTitle}…`}
                    rows={3}
                    value={draft}
                    onChange={(event) => onDraftChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (
                            event.key === "Enter" &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                        ) {
                            event.preventDefault();
                            onSubmit();
                        }
                    }}
                    className="min-h-24"
                />
                {(attachments || turns.length > 0) && (
                    <ChatPromptInputFooter
                        start={attachments}
                        end={
                            turns.length > 0 && (
                                <Button
                                    size="sm"
                                    intent="neutral"
                                    icon={<PlusIcon />}
                                    disabled={busy}
                                    onClick={() => setConfirming(true)}
                                >
                                    New chat
                                </Button>
                            )
                        }
                    />
                )}
            </ChatPromptInput>
            <ConfirmationDialog
                open={confirming}
                title="Start a new chat?"
                description={`This clears your conversation with ${agentTitle}.`}
                confirmLabel="Clear chat"
                confirmIcon={<TrashIcon />}
                onConfirm={() => {
                    setConfirming(false);
                    onClear();
                }}
                onCancel={() => setConfirming(false)}
            />
        </>
    );
}

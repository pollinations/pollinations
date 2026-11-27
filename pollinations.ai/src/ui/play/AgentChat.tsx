import {
    useAuthState,
    usePollinationsChatTransport,
} from "@pollinations/sdk/react";
import {
    Alert,
    Button,
    ChatPromptInput,
    ChatPromptInputFooter,
    ChatPromptTextarea,
    ConfirmationDialog,
    CopyButton,
    CopyStateIcon,
    LoadingStatus,
    PlusIcon,
    RefreshIcon,
    Text,
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
    finalMedia,
    replyMedia,
    replyText,
    toolLabel,
    toolMedia,
    userParts,
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
function chatMessages(turns: AgentTurn[], linkImages: boolean) {
    return turns.flatMap((turn, index) => {
        const user = { role: "user", parts: userParts(turn, linkImages) };
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

type Threads = Record<string, AgentTurn[]>;

// Conversations are kept for this browser tab, so a reload does not lose them.
// Tab storage goes when the tab closes; disconnecting clears it sooner.
const STORAGE_KEY = "play-agent-threads";

/** Names the account that owns the saved conversations without storing its key. */
function ownerTag(apiKey: string) {
    let hash = 5381;
    for (let index = 0; index < apiKey.length; index++)
        hash = ((hash * 33) ^ apiKey.charCodeAt(index)) >>> 0;
    return hash.toString(36);
}

function tabStorage() {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
}

/** This account's saved conversations. A reply that was still arriving when
 * the page went away comes back as interrupted, with Retry. */
function loadThreads(apiKey: string | null | undefined): Threads {
    try {
        const saved = JSON.parse(
            (apiKey && tabStorage()?.getItem(STORAGE_KEY)) || "null",
        );
        if (!apiKey || saved?.owner !== ownerTag(apiKey)) return {};
        return Object.fromEntries(
            Object.entries(saved.threads as Threads).map(([agent, turns]) => [
                agent,
                turns.map((turn) =>
                    turn.status === "running"
                        ? {
                              ...turn,
                              status: "interrupted" as const,
                              error: "The page was reloaded before the reply finished.",
                          }
                        : turn,
                ),
            ]),
        );
    } catch {
        return {};
    }
}

function saveThreads(apiKey: string, threads: Threads) {
    try {
        tabStorage()?.setItem(
            STORAGE_KEY,
            JSON.stringify({
                owner: ownerTag(apiKey),
                // A File cannot be saved; its uploaded link can.
                threads: Object.fromEntries(
                    Object.entries(threads).map(([agent, turns]) => [
                        agent,
                        turns.map(({ files: _files, ...turn }) => turn),
                    ]),
                ),
            }),
        );
    } catch {
        // Storage is full or blocked: the conversation stays in memory.
    }
}

/**
 * One conversation per agent, answered by a /v1/responses stream and kept for
 * the browser tab.
 * `upload` turns an attached file into the link the agent receives. With
 * `linkImages` the agent also gets each image's link, for its tools.
 */
export function useAgentChat(
    agent: string | undefined,
    upload: (file: File) => Promise<string>,
    linkImages = false,
) {
    const transport = usePollinationsChatTransport({ model: agent });
    const requests = useRef<Record<string, AbortController>>({});
    // Conversations belong to the signed-in account: they go when it changes.
    const { apiKey } = useAuthState();
    const [threads, setThreads] = useState(() => loadThreads(apiKey));
    const [owner, setOwner] = useState(apiKey);
    if (owner !== apiKey) {
        setOwner(apiKey);
        setThreads(loadThreads(apiKey));
    }
    const signedIn = useRef(apiKey);
    useEffect(() => {
        if (apiKey) saveThreads(apiKey, threads);
        // Disconnecting clears them; a page that has not read its key yet does not.
        else if (signedIn.current) tabStorage()?.removeItem(STORAGE_KEY);
        signedIn.current = apiKey;
    }, [apiKey, threads]);
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
                    ...(patch.status &&
                        patch.status !== "running" && { endedAt: Date.now() }),
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
        show({
            status: "running",
            error: undefined,
            output: undefined,
            startedAt: Date.now(),
            endedAt: undefined,
        });
        try {
            const attachments =
                turn.attachments ??
                (await Promise.all(
                    (turn.files ?? []).map(async (file) => ({
                        url: await upload(file),
                        mediaType: file.type,
                        filename: file.name,
                    })),
                ));
            show({ attachments });
            const stream = await transport.sendMessages({
                messages: chatMessages(
                    [...turns.slice(0, -1), { ...turn, attachments }],
                    linkImages,
                ),
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

/** "45s" or "2m 5s". */
function elapsed(turn: AgentTurn) {
    if (!turn.startedAt || !turn.endedAt) return undefined;
    const seconds = Math.max(
        1,
        Math.round((turn.endedAt - turn.startedAt) / 1000),
    );
    return seconds < 60
        ? `${seconds}s`
        : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Where a reply stands, in a few words: the step in hand, or how it ended. */
function TurnStatus({ turn, steps }: { turn: AgentTurn; steps: number }) {
    if (turn.status === "running") {
        const waiting = turn.items.filter(
            (item): item is AgentToolCall =>
                item.type === "tool" && !item.result,
        );
        const current = waiting[waiting.length - 1];
        return (
            <LoadingStatus>
                {current ? `${toolLabel(current.name)}…` : "Working…"}
            </LoadingStatus>
        );
    }
    return (
        <span className="text-sm text-theme-text-muted">
            {[
                turn.status === "done"
                    ? "Done"
                    : turn.status === "stopped"
                      ? "Stopped"
                      : "Interrupted",
                elapsed(turn),
                steps > 0 && `${steps} ${steps === 1 ? "step" : "steps"}`,
            ]
                .filter(Boolean)
                .join(" · ")}
        </span>
    );
}

const TILES =
    "m-0 grid list-none items-start gap-3 p-0 [&>li]:min-w-0 [&>li:has(audio)]:col-span-full";
// Thumbnails: the download button shrinks with the tile it sits on, and a
// clip keeps only its play button.
const SMALL_TILES = `${TILES} [&_a[download]]:origin-bottom-right [&_a[download]]:scale-[0.65] [&_.play-video-extra]:hidden [&_.play-video-bar]:right-auto [&_.play-video-bar]:pr-1`;

/**
 * One reply: the result, then one line saying where it stands. That line opens
 * the process, in the order it happened: what the agent said, each step, and
 * the files a step made on the way.
 */
export function Reply({
    turn,
    onRetry,
    renderMedia,
}: {
    turn: AgentTurn;
    onRetry?: () => void;
    renderMedia: RenderMedia;
}) {
    const [open, setOpen] = useState(false);
    const running = turn.status === "running";
    const text = replyText(turn);
    const media = replyMedia(turn.items, !running);
    const result = running ? [] : finalMedia(turn.items, true);
    const steps = turn.items.filter((item) => item.type === "tool").length;
    const words = (item: AgentItem & { type: "text" }, key: number) => (
        <Suspense key={key} fallback={item.text}>
            <Markdown media="links">{withoutMedia(item.text, media)}</Markdown>
        </Suspense>
    );
    // With no file to show, what the agent said is the result.
    const answer = !running && result.length === 0 && text;
    return (
        <div className="flex min-w-0 flex-col gap-3">
            {running && (
                <div
                    aria-hidden="true"
                    className="h-32 animate-pulse rounded-card bg-theme-bg-subtle motion-reduce:animate-none"
                />
            )}
            {result.length > 0 && (
                <ul
                    aria-label="Result"
                    // One result gets room; several share the row.
                    className={`${TILES} ${result.length === 1 ? "grid-cols-1" : "grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]"}`}
                >
                    {result.map((url) => (
                        <li key={url}>{renderMedia(url)}</li>
                    ))}
                </ul>
            )}
            {answer && (
                <div className="flex min-w-0 flex-col gap-2 [overflow-wrap:anywhere]">
                    {turn.items.map(
                        (item, index) =>
                            item.type === "text" && words(item, index),
                    )}
                    <div className="flex">
                        <CopyButton
                            value={text}
                            variant="button"
                            intent="neutral"
                            aria-label="Copy reply"
                            title="Copy reply"
                            className="polli:h-9 polli:w-9 polli:min-h-0 polli:p-0"
                        >
                            {(copied) => (
                                <CopyStateIcon
                                    copied={copied}
                                    className="size-4"
                                />
                            )}
                        </CopyButton>
                    </div>
                </div>
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
            <details
                onToggle={(event) => setOpen(event.currentTarget.open)}
                className="min-w-0"
            >
                <summary className="w-fit cursor-pointer marker:text-theme-text-muted">
                    <span className="inline-flex align-middle">
                        <TurnStatus turn={turn} steps={steps} />
                    </span>
                </summary>
                {/* Drawn only once opened: the process can hold many files. */}
                {open && (
                    <ol
                        aria-label="Process"
                        className="m-0 mt-3 flex list-none flex-col gap-3 p-0 [overflow-wrap:anywhere]"
                    >
                        {turn.items.map((item, index) =>
                            item.type === "text" ? (
                                // Already shown above when it is the result.
                                !answer && (
                                    <li key={index} className="min-w-0">
                                        {words(item, index)}
                                    </li>
                                )
                            ) : (
                                <li
                                    key={item.callId}
                                    className="flex min-w-0 flex-col gap-2"
                                >
                                    <ToolCallDetails
                                        name={item.name}
                                        label={toolLabel(item.name)}
                                        input={item.arguments}
                                        {...(item.result?.isError
                                            ? { error: item.result.output }
                                            : { output: item.result?.output })}
                                        status={toolStatus(item, turn.status)}
                                    />
                                    {toolMedia(item).length > 0 && (
                                        <ul
                                            aria-label="Made in this step"
                                            className={`${SMALL_TILES} grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]`}
                                        >
                                            {toolMedia(item).map((url) => (
                                                <li key={url}>
                                                    {renderMedia(url)}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            ),
                        )}
                    </ol>
                )}
            </details>
        </div>
    );
}

/** Clears the conversation, after asking. It sits beside Send. */
export function NewChatButton({
    agentTitle,
    disabled,
    onClear,
}: {
    agentTitle: string;
    disabled: boolean;
    onClear: () => void;
}) {
    const [confirming, setConfirming] = useState(false);
    return (
        <>
            <Button
                intent="neutral"
                icon={<PlusIcon />}
                disabled={disabled}
                onClick={() => setConfirming(true)}
            >
                New chat
            </Button>
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

/** The Agent tab's inputs: the conversation in its card, then the composer. */
export function AgentChat({
    agentTitle,
    turns,
    draft,
    onDraftChange,
    onSubmit,
    onRetry,
    attachments,
    renderMedia,
}: {
    renderMedia: RenderMedia;
    agentTitle: string;
    turns: AgentTurn[];
    draft: string;
    onDraftChange: (value: string) => void;
    onSubmit: () => void;
    onRetry: () => void;
    /** The upload tiles for the files the agent accepts. */
    attachments?: ReactNode;
}) {
    const last = turns[turns.length - 1];

    return (
        <>
            {turns.length > 0 && (
                <section
                    aria-label={`Conversation with ${agentTitle}`}
                    // The thread is one card. A question is a card inside it;
                    // an answer sits on the thread itself.
                    className="flex min-w-0 flex-col gap-3 rounded-card bg-surface-opaque p-4"
                >
                    {turns.map((turn) => (
                        // What was asked in a card of its own, then what
                        // came back.
                        <Fragment key={turn.id}>
                            <article
                                aria-label="Request"
                                // Questions sit to the right, answers to the
                                // left: neither takes the full width.
                                className="flex w-fit max-w-[85%] min-w-0 flex-col gap-3 self-end rounded-card bg-theme-bg-subtle p-4"
                            >
                                <Text
                                    as="p"
                                    weight="semibold"
                                    tone="strong"
                                    className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]"
                                >
                                    {turn.prompt}
                                </Text>
                                {turn.attachments &&
                                    turn.attachments.length > 0 && (
                                        <ul
                                            aria-label="Attached"
                                            className={`${SMALL_TILES} grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]`}
                                        >
                                            {turn.attachments.map(({ url }) => (
                                                <li key={url}>
                                                    {renderMedia(url)}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                            </article>
                            <article
                                aria-label="Reply"
                                className="w-full max-w-[85%] min-w-0 self-start"
                            >
                                <Reply
                                    turn={turn}
                                    renderMedia={renderMedia}
                                    onRetry={
                                        turn === last ? onRetry : undefined
                                    }
                                />
                            </article>
                        </Fragment>
                    ))}
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
                {attachments && <ChatPromptInputFooter start={attachments} />}
            </ChatPromptInput>
        </>
    );
}

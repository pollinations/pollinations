// Real Claude Agent SDK runner — the body of a container `code-bee` session.
//
// API verified against @anthropic-ai/claude-agent-sdk@0.2.126 (sdk.d.ts):
//   - query({ prompt, options }) → AsyncGenerator<SDKMessage, void>
//   - Options.cwd?: string                — per-session workdir (the whole
//     point of the container runtime)
//   - Options.allowedTools / disallowedTools — restrict tool surface
//   - Options.permissionMode: 'default'|'acceptEdits'|'bypassPermissions'|...
//   - Options.maxTurns?: number
//   - Returned messages are SDKMessage variants — we only surface assistant
//     text deltas + final result here.
//
// This is dependency-injected: the SDK isn't installed in the repo (it pulls
// 4MB + transitive deps), so the runner accepts the `query` function as an
// argument. Tests substitute a fake generator; real deployments pass the SDK
// import. Same pattern keeps the unit tests install-free.

export type AgentMessage =
    | { type: "text"; text: string }
    | { type: "tool"; name: string; status: "started" | "finished" }
    | { type: "result"; text: string; turnsUsed: number; ok: boolean };

export type SDKQuery = (params: {
    prompt: string;
    options?: {
        cwd?: string;
        allowedTools?: string[];
        disallowedTools?: string[];
        permissionMode?: string;
        maxTurns?: number;
        abortController?: AbortController;
    };
}) => AsyncIterable<unknown>;

export type RunOptions = {
    /** Per-session working directory. Required for container runtime. */
    cwd: string;
    /** Hard ceiling on agentic turns. Container time costs money. */
    maxTurns?: number;
    /** Tool allowlist. Default is "code editing only" — no Bash. */
    allowedTools?: string[];
    /** Permission mode. Default: 'default' (prompt). For automation, callers
     *  pass 'acceptEdits' (auto-accept Read/Edit/Write) or
     *  'bypassPermissions' (with the SDK's safety acknowledgement). */
    permissionMode?: string;
    /** Abort signal — wired through to the SDK so a closed SSE stream
     *  cancels the underlying agent loop. */
    signal?: AbortSignal;
};

const DEFAULT_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep"];

/**
 * Run one user turn through the Claude Agent SDK and yield AgentMessage events.
 * Caller decides what to do with them: SSE chunks for a web chat, console
 * lines for a CLI demo, etc.
 */
export async function* runCodeBeeTurn(
    query: SDKQuery,
    prompt: string,
    opts: RunOptions,
): AsyncGenerator<AgentMessage> {
    if (!opts.cwd) throw new Error("cwd is required");

    const ac = new AbortController();
    if (opts.signal) {
        opts.signal.addEventListener("abort", () => ac.abort(), { once: true });
    }

    const stream = query({
        prompt,
        options: {
            cwd: opts.cwd,
            maxTurns: opts.maxTurns ?? 8,
            allowedTools: opts.allowedTools ?? DEFAULT_TOOLS,
            permissionMode: opts.permissionMode ?? "default",
            abortController: ac,
        },
    });

    let turns = 0;
    let lastText = "";
    let ok = false;
    for await (const raw of stream) {
        const msg = raw as {
            type?: string;
            subtype?: string;
            message?: { content?: Array<{ type?: string; text?: string }> };
            tool_use?: { name?: string };
            tool_name?: string;
            num_turns?: number;
        };

        // SDKAssistantMessage carries the model's content blocks.
        if (msg.type === "assistant" && msg.message?.content) {
            for (const block of msg.message.content) {
                if (block.type === "text" && block.text) {
                    lastText = block.text;
                    yield { type: "text", text: block.text };
                }
            }
        }

        // SDKToolUseSummaryMessage / tool progress — surface tool starts so
        // the UI can render "running Bash…".
        if (msg.type === "tool_use_summary" && msg.tool_name) {
            yield {
                type: "tool",
                name: msg.tool_name,
                status: "finished",
            };
        }

        // SDKResultMessage marks the end of the turn.
        if (msg.type === "result") {
            turns = msg.num_turns ?? turns;
            ok = msg.subtype === "success";
            break;
        }
    }

    yield { type: "result", text: lastText, turnsUsed: turns, ok };
}

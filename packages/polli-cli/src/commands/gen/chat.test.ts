import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createChatCommand } from "./chat.js";

const STREAM_OK =
    'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n';

// The interactive session owns a readline interface. Replace it with a double
// that records what the command does after a line is handled, so we can assert
// that a finished session is never prompted again.
const h = vi.hoisted(() => {
    const state = {
        closed: false,
        prompts: 0,
        promptsAfterClose: 0,
        onClose: undefined as (() => void) | undefined,
        lineHandler: undefined as
            | ((line: string) => Promise<void> | void)
            | undefined,
    };
    const fakeRl = {
        prompt() {
            if (state.closed) {
                state.promptsAfterClose++;
                throw new Error("readline was closed");
            }
            state.prompts++;
        },
        close() {
            if (state.closed) return;
            state.closed = true;
            state.onClose?.();
        },
        on(event: string, handler: (line: string) => Promise<void> | void) {
            if (event === "line") state.lineHandler = handler;
            if (event === "close") state.onClose = handler as () => void;
            return fakeRl;
        },
    };
    const reset = () => {
        state.closed = false;
        state.prompts = 0;
        state.promptsAfterClose = 0;
        state.onClose = undefined;
        state.lineHandler = undefined;
    };
    return { state, fakeRl, reset };
});

vi.mock("node:readline", () => ({
    createInterface: () => {
        h.reset();
        return h.fakeRl;
    },
}));

const originalExitCode = process.exitCode;
const pendingTranscriptPath = join(
    tmpdir(),
    `polli-chat-pending-${process.pid}.txt`,
);

function prepare(fetchImpl: () => Promise<Response>) {
    setKeyOverride("sk_test");
    setOutputMode("human");
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const fetch = vi.fn(fetchImpl);
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

async function startSession(argv: string[] = []) {
    await createChatCommand().parseAsync(argv, { from: "user" });
    const line = h.state.lineHandler;
    if (!line) throw new Error("chat never registered a line handler");
    return line;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    process.exitCode = originalExitCode;
    rmSync(pendingTranscriptPath, { force: true });
});

describe("polli gen chat session lifecycle", () => {
    it("ends on /exit without sending it and without prompting a closed interface", async () => {
        const fetch = prepare(async () => Response.json({ ok: true }));

        const line = await startSession();
        expect(h.state.prompts).toBe(1);

        await line("/exit");

        expect(fetch).not.toHaveBeenCalled();
        expect(h.state.promptsAfterClose).toBe(0);
        expect(process.exitCode).toBe(0);
    });

    it("keeps the exit code of a fatal API error instead of crashing after close", async () => {
        const fetch = prepare(async () =>
            Response.json(
                { error: { code: "INSUFFICIENT_BALANCE" } },
                { status: 402 },
            ),
        );

        const line = await startSession();
        await line("hello");

        expect(fetch).toHaveBeenCalledTimes(2); // chat + balance hint lookup
        expect(h.state.promptsAfterClose).toBe(0);
        expect(process.exitCode).toBe(1);
    });

    it("prompts again after a normal turn and still exits cleanly", async () => {
        const fetch = prepare(
            async () =>
                new Response(STREAM_OK, {
                    headers: { "Content-Type": "text/event-stream" },
                }),
        );

        const line = await startSession();
        await line("hello");

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(h.state.prompts).toBe(2);
        expect(h.state.promptsAfterClose).toBe(0);
        expect(process.exitCode).toBeUndefined();

        await line("/exit");

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(process.exitCode).toBe(0);
    });

    it("does not prompt a closed interface when stdin ends mid-turn", async () => {
        let release: (() => void) | undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const fetch = prepare(async () => {
            await gate;
            return new Response(STREAM_OK, {
                headers: { "Content-Type": "text/event-stream" },
            });
        });

        const line = await startSession();
        const turn = line("hello");
        // EOF closes readline while the request is still in flight.
        h.fakeRl.close();
        release?.();
        await turn;

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(h.state.promptsAfterClose).toBe(0);
        expect(process.exitCode).toBe(0);
    });

    it("saves the conversation, without /exit, when /exit meets --save", async () => {
        prepare(
            async () =>
                new Response(STREAM_OK, {
                    headers: { "Content-Type": "text/event-stream" },
                }),
        );
        const path = join(tmpdir(), `polli-chat-${process.pid}.txt`);
        rmSync(path, { force: true });

        const line = await startSession(["--save", path]);
        await line("hello");
        await line("/exit");

        expect(existsSync(path)).toBe(true);
        const transcript = readFileSync(path, "utf-8");
        expect(transcript).toContain("You: hello");
        expect(transcript).toContain("AI: hi");
        expect(transcript).not.toContain("/exit");
        rmSync(path, { force: true });
    });

    it.each([
        ["EOF", "human"],
        ["/exit", "human"],
        ["EOF", "json"],
        ["/exit", "json"],
    ] as const)("saves a pending reply after %s in %s mode", async (exit, mode) => {
        let release!: (response: Response) => void;
        const response = new Promise<Response>((resolve) => {
            release = resolve;
        });
        const fetch = prepare(() => response);
        setOutputMode(mode);

        const line = await startSession(["--save", pendingTranscriptPath]);
        const turn = line("hello");
        if (exit === "EOF") h.fakeRl.close();
        else await line(exit);
        const savedBeforeReply = existsSync(pendingTranscriptPath);
        release(
            mode === "human"
                ? new Response(STREAM_OK)
                : Response.json({
                      choices: [{ message: { content: "hi" } }],
                      model: "test-model",
                  }),
        );
        await turn;

        expect(savedBeforeReply).toBe(false);
        expect(readFileSync(pendingTranscriptPath, "utf-8")).toBe(
            "You: hello\n\nAI: hi",
        );
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(h.state.promptsAfterClose).toBe(0);
        expect(process.exitCode).toBe(0);
    });

    it("saves once after all pending replies finish", async () => {
        let releaseFirst!: (response: Response) => void;
        let releaseSecond!: (response: Response) => void;
        const responses = [
            new Promise<Response>((resolve) => {
                releaseFirst = resolve;
            }),
            new Promise<Response>((resolve) => {
                releaseSecond = resolve;
            }),
        ];
        const fetch = prepare(
            () =>
                responses.shift() ??
                Promise.reject(new Error("Unexpected request")),
        );

        const line = await startSession(["--save", pendingTranscriptPath]);
        const first = line("first");
        const second = line("second");
        h.fakeRl.close();
        releaseFirst(new Response(STREAM_OK.replace('"hi"', '"first reply"')));
        await first;
        const savedBeforeLastReply = existsSync(pendingTranscriptPath);
        releaseSecond(
            new Response(STREAM_OK.replace('"hi"', '"second reply"')),
        );
        await second;

        expect(savedBeforeLastReply).toBe(false);
        const transcript = readFileSync(pendingTranscriptPath, "utf-8");
        expect(transcript).toContain("AI: first reply");
        expect(transcript).toContain("AI: second reply");
        const saves = vi
            .mocked(process.stderr.write)
            .mock.calls.filter(([value]) =>
                String(value).includes(`Saved to ${pendingTranscriptPath}`),
            );
        expect(saves).toHaveLength(1);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(h.state.promptsAfterClose).toBe(0);
    });

    it("saves the cleaned transcript when a pending request fails after close", async () => {
        let reject!: (error: Error) => void;
        prepare(
            () =>
                new Promise<Response>((_resolve, rejectResponse) => {
                    reject = rejectResponse;
                }),
        );

        const line = await startSession(["--save", pendingTranscriptPath]);
        const turn = line("hello");
        h.fakeRl.close();
        reject(new Error("provider failed"));
        await turn;

        expect(readFileSync(pendingTranscriptPath, "utf-8")).toBe("");
        expect(h.state.promptsAfterClose).toBe(0);
        expect(process.exitCode).toBe(0);
    });
});

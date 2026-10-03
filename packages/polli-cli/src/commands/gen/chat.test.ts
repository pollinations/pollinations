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
});

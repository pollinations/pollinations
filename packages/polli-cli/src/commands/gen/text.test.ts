import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createTextCommand } from "./text.js";

const completion = {
    choices: [{ message: { content: "hello" } }],
    model: "server-model",
    usage: { total_tokens: 7 },
};
const stream = [
    'data: {"model":"server-model","choices":[{"delta":{"content":"hello"}}]}',
    'data: {"model":"server-model","choices":[],"usage":{"total_tokens":7}}',
    "data: [DONE]",
    "",
].join("\n\n");

const originalStdoutTTY = process.stdout.isTTY;
const originalStdinTTY = process.stdin.isTTY;
const folders: string[] = [];

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setOutputMode("human");
    setKeyOverride(undefined);
    Object.defineProperty(process.stdout, "isTTY", {
        configurable: true,
        value: originalStdoutTTY,
    });
    Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalStdinTTY,
    });
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true });
});

async function run(args: string[], tty: boolean, json = true) {
    Object.defineProperty(process.stdout, "isTTY", {
        configurable: true,
        value: tty,
    });
    Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: true,
    });
    setKeyOverride("sk_test");
    setOutputMode(json ? "json" : "human");
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((value) => {
        output.push(String(value));
        return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        requests.push(body);
        return body.stream
            ? new Response(stream, {
                  headers: { "content-type": "text/event-stream" },
              })
            : Response.json(completion);
    });
    await createTextCommand().parseAsync(["hi", ...args], { from: "user" });
    return { request: requests[0], output: output.join("") };
}

describe("gen text output", () => {
    it("buffers JSON by default when stdout is piped", async () => {
        const { request, output } = await run([], false);
        expect(request.stream).toBeUndefined();
        expect(JSON.parse(output)).toEqual({
            content: "hello",
            model: "server-model",
            tokens: 7,
        });
    });

    it("uses server metadata when streaming is explicitly requested", async () => {
        const { request, output } = await run(["--stream"], false);
        expect(request.stream).toBe(true);
        expect(JSON.parse(output)).toEqual({
            content: "hello",
            model: "server-model",
            tokens: 7,
        });
    });

    it("buffers in a TTY when --no-stream is requested", async () => {
        const { request } = await run(["--no-stream"], true);
        expect(request.stream).toBeUndefined();
    });

    it("emits metadata after writing a text file in JSON mode", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-text-test-"));
        folders.push(folder);
        const file = join(folder, "reply.txt");
        const { request, output } = await run(["--output", file], false);
        expect(request.stream).toBeUndefined();
        expect(readFileSync(file, "utf8")).toBe("hello");
        expect(JSON.parse(output)).toEqual({
            path: file,
            size: 5,
            model: "server-model",
            tokens: 7,
        });
    });
});

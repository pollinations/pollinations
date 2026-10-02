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

async function run(
    args: string[],
    tty: boolean,
    json = true,
    fixtures: { completion?: unknown; stream?: string } = {},
) {
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
    const errors: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((value) => {
        errors.push(String(value));
        return true;
    });
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        requests.push(body);
        return body.stream
            ? new Response(fixtures.stream ?? stream, {
                  headers: { "content-type": "text/event-stream" },
              })
            : Response.json(fixtures.completion ?? completion);
    });
    await createTextCommand().parseAsync(["hi", ...args], { from: "user" });
    return {
        request: requests[0],
        output: output.join(""),
        stderr: errors.join(""),
    };
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

describe("gen text truncation warnings", () => {
    it.each([
        "",
        "partial",
    ])("preserves buffered JSON for length output %j", async (content) => {
        const { output, stderr } = await run([], false, true, {
            completion: {
                ...completion,
                choices: [{ message: { content }, finish_reason: "length" }],
            },
        });
        expect(JSON.parse(output)).toEqual({
            content,
            model: "server-model",
            tokens: 7,
        });
        expect(stderr).toContain("output token limit");
        expect(stderr.match(/warn:/g)).toHaveLength(1);
    });

    it.each([
        "",
        "partial",
    ])("preserves human output for length output %j", async (content) => {
        const { output, stderr } = await run(["--no-stream"], true, false, {
            completion: {
                ...completion,
                choices: [{ message: { content }, finish_reason: "length" }],
            },
        });
        expect(output).toBe(`${content}\n`);
        expect(stderr).toContain("output token limit");
        expect(stderr.match(/warn:/g)).toHaveLength(1);
    });

    it.each(
        ["", "partial"].flatMap((content) =>
            [true, false].map((json) => ({ content, json })),
        ),
    )("preserves file output for length content $content, JSON=$json", async ({
        content,
        json,
    }) => {
        const folder = mkdtempSync(join(tmpdir(), "polli-text-test-"));
        folders.push(folder);
        const file = join(folder, "reply.txt");
        const { output, stderr } = await run(["--output", file], false, json, {
            completion: {
                ...completion,
                choices: [{ message: { content }, finish_reason: "length" }],
            },
        });
        expect(readFileSync(file)).toEqual(Buffer.from(content, "utf8"));
        if (json)
            expect(JSON.parse(output)).toEqual({
                path: file,
                size: Buffer.byteLength(content),
                model: "server-model",
                tokens: 7,
            });
        else expect(output).toBe("");
        expect(stderr).toContain("output token limit");
        expect(stderr.match(/warn:/g)).toHaveLength(1);
    });

    it.each(
        ["", "partial"].flatMap((content) =>
            [true, false].map((json) => ({ content, json })),
        ),
    )("preserves streamed content $content, JSON=$json, through trailing metadata", async ({
        content,
        json,
    }) => {
        const events = [
            {
                model: "server-model",
                choices: [{ delta: { content }, finish_reason: null }],
            },
            { choices: [{ delta: {}, finish_reason: "length" }] },
            { choices: [], usage: { total_tokens: 7 } },
            { choices: [{ delta: {}, finish_reason: null }] },
        ];
        const fixture = [
            ...events.map((event) => `data: ${JSON.stringify(event)}`),
            "data: [DONE]",
            "",
        ].join("\n\n");
        const { output, stderr } = await run(["--stream"], true, json, {
            stream: fixture,
        });
        if (json)
            expect(JSON.parse(output)).toEqual({
                content,
                model: "server-model",
                tokens: 7,
            });
        else expect(output).toBe(`${content}\n`);
        expect(stderr).toContain("output token limit");
        expect(stderr.match(/warn:/g)).toHaveLength(1);
    });

    it.each(
        [
            undefined,
            null,
            "stop",
            "unknown",
            "content_filter",
            "tool_calls",
            "function_call",
        ].flatMap((reason) =>
            [false, true].map((streaming) => ({ reason, streaming })),
        ),
    )("does not infer truncation for $reason, streaming=$streaming", async ({
        reason,
        streaming,
    }) => {
        const data = {
            ...completion,
            choices: [{ message: { content: "" }, finish_reason: reason }],
        };
        const events = [
            {
                model: "server-model",
                choices: [{ delta: { content: "" }, finish_reason: reason }],
            },
            { choices: [], usage: { total_tokens: 7 } },
        ];
        const fixture = [
            ...events.map((event) => `data: ${JSON.stringify(event)}`),
            "data: [DONE]",
            "",
        ].join("\n\n");
        const { output, stderr } = await run(
            streaming ? ["--stream"] : [],
            false,
            true,
            { completion: data, stream: fixture },
        );
        expect(JSON.parse(output)).toEqual({
            content: "",
            model: "server-model",
            tokens: 7,
        });
        expect(stderr).not.toMatch(/warn:/);
    });
});

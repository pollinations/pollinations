import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createEmbeddingsCommand } from "./embeddings.js";

const originalStdinTTY = process.stdin.isTTY;
const response = {
    object: "list",
    data: [
        { object: "embedding", embedding: [0.2], index: 1 },
        { object: "embedding", embedding: [0.1], index: 0 },
    ],
    model: "server-model",
    usage: { prompt_tokens: 4, total_tokens: 4 },
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalStdinTTY,
    });
});

function prepare(json: boolean) {
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
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
        requests.push(JSON.parse(String(init.body)));
        return Response.json(response);
    });
    return { output, requests };
}

describe("gen embeddings", () => {
    it("prints one embedding per line, in input order", async () => {
        const { output, requests } = prepare(false);
        await createEmbeddingsCommand().parseAsync(["first", "second"], {
            from: "user",
        });
        expect(requests[0].input).toEqual(["first", "second"]);
        expect(output.join("")).toBe("[0.1]\n[0.2]\n");
    });

    it("reads one input per stdin line when no arguments are given", async () => {
        const { requests } = prepare(false);
        const { Readable } = await import("node:stream");
        const originalStdin = process.stdin;
        Object.defineProperty(process, "stdin", {
            configurable: true,
            value: Readable.from([Buffer.from("first\nsecond\n")]),
        });
        try {
            await createEmbeddingsCommand().parseAsync([], { from: "user" });
            expect(requests[0].input).toEqual(["first", "second"]);
        } finally {
            Object.defineProperty(process, "stdin", {
                configurable: true,
                value: originalStdin,
            });
        }
    });

    it("forwards --model, --dimensions, --task-type and --input-type", async () => {
        const { requests } = prepare(false);
        await createEmbeddingsCommand().parseAsync(
            [
                "hi",
                "--model",
                "google/gemini-embedding-2",
                "--dimensions",
                "256",
                "--task-type",
                "RETRIEVAL_QUERY",
                "--input-type",
                "query",
            ],
            { from: "user" },
        );
        expect(requests[0]).toMatchObject({
            model: "google/gemini-embedding-2",
            dimensions: 256,
            task_type: "RETRIEVAL_QUERY",
            input_type: "query",
        });
    });

    it("--json prints the full response including usage", async () => {
        const { output } = prepare(true);
        await createEmbeddingsCommand().parseAsync(["hi"], { from: "user" });
        expect(JSON.parse(output.join(""))).toEqual(response);
    });

    it("rejects an out-of-range --dimensions before fetching", async () => {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        vi.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("CLI exited");
        });
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        await expect(
            createEmbeddingsCommand().parseAsync(["hi", "--dimensions", "5"], {
                from: "user",
            }),
        ).rejects.toThrow("CLI exited");
        expect(fetch).not.toHaveBeenCalled();
    });
});

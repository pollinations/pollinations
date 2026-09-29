import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createEmbeddingsCommand } from "./embeddings.js";

const originalStdinTTY = process.stdin.isTTY;

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

function stubFetch(data: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" },
        });
    });
    return calls;
}

function captureStdout() {
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((value) => {
        output.push(String(value));
        return true;
    });
    return output;
}

describe("gen embeddings", () => {
    it("sends every argument and prints one vector per line", async () => {
        setKeyOverride("sk_test");
        setOutputMode("human");
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: true,
        });
        const output = captureStdout();
        const calls = stubFetch({
            data: [
                { index: 1, embedding: [0.4, 0.5] },
                { index: 0, embedding: [0.1, 0.2] },
            ],
            usage: { prompt_tokens: 4 },
        });

        await createEmbeddingsCommand().parseAsync(
            ["first text", "second text", "--dimensions", "256"],
            { from: "user" },
        );

        expect(calls).toHaveLength(1);
        expect(new URL(calls[0].url).pathname).toBe("/v1/embeddings");
        expect(JSON.parse(String(calls[0].init.body))).toEqual({
            model: "openai/text-embedding-3-small",
            input: ["first text", "second text"],
            dimensions: 256,
        });
        // Vector order follows the input order, not the response order.
        expect(output).toEqual(["[0.1,0.2]\n", "[0.4,0.5]\n"]);
    });

    it("passes the retrieval hints through", async () => {
        setKeyOverride("sk_test");
        setOutputMode("human");
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: true,
        });
        captureStdout();
        const calls = stubFetch({ data: [{ index: 0, embedding: [1] }] });

        await createEmbeddingsCommand().parseAsync(
            [
                "search query",
                "--model",
                "cohere/embed-v4.0",
                "--input-type",
                "query",
                "--task-type",
                "RETRIEVAL_QUERY",
            ],
            { from: "user" },
        );

        expect(JSON.parse(String(calls[0].init.body))).toEqual({
            model: "cohere/embed-v4.0",
            input: ["search query"],
            input_type: "query",
            task_type: "RETRIEVAL_QUERY",
        });
    });

    it("prints the full response with usage in json mode", async () => {
        setKeyOverride("sk_test");
        setOutputMode("json");
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: true,
        });
        const output = captureStdout();
        stubFetch({
            object: "list",
            data: [{ index: 0, embedding: [0.1] }],
            usage: { prompt_tokens: 2, total_tokens: 2 },
        });

        await createEmbeddingsCommand().parseAsync(["hello"], {
            from: "user",
        });

        const printed = JSON.parse(output.join(""));
        expect(printed.usage).toEqual({ prompt_tokens: 2, total_tokens: 2 });
        expect(printed.data[0].embedding).toEqual([0.1]);
    });

    it("reads one input per line from stdin", async () => {
        setKeyOverride("sk_test");
        setOutputMode("human");
        const output = captureStdout();
        const calls = stubFetch({
            data: [
                { index: 0, embedding: [1] },
                { index: 1, embedding: [2] },
            ],
        });
        vi.spyOn(process.stdin, "on").mockImplementation(((
            event: string,
            handler: (...args: unknown[]) => void,
        ) => {
            if (event === "data") handler(Buffer.from("a\nb\n"));
            if (event === "end") handler();
            return process.stdin;
        }) as never);

        await createEmbeddingsCommand().parseAsync([], { from: "user" });

        expect(JSON.parse(String(calls[0].init.body)).input).toEqual([
            "a",
            "b",
        ]);
        expect(output).toEqual(["[1]\n", "[2]\n"]);
    });
});

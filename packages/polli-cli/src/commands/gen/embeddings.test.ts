import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createEmbeddingsCommand } from "./embeddings.js";

const originalStdoutTTY = process.stdout.isTTY;
const originalStdinTTY = process.stdin.isTTY;

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    Object.defineProperty(process.stdout, "isTTY", {
        configurable: true,
        value: originalStdoutTTY,
    });
    Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalStdinTTY,
    });
});

const embeddingResponse = {
    object: "list",
    model: "openai/text-embedding-3-small",
    data: [
        { object: "embedding", index: 0, embedding: [0.1, 0.2, 0.3] },
        { object: "embedding", index: 1, embedding: [0.4, 0.5] },
    ],
    usage: { prompt_tokens: 7, total_tokens: 7 },
};

describe("gen embeddings", () => {
    it("posts the inputs as an array and prints one vector per line", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: true,
        });
        Object.defineProperty(process.stdout, "isTTY", {
            configurable: true,
            value: false,
        });
        setKeyOverride("sk_test");
        const output: string[] = [];
        vi.spyOn(process.stdout, "write").mockImplementation((value) => {
            output.push(String(value));
            return true;
        });
        const fetchMock = vi.fn(
            async (_url: string, _init?: RequestInit) =>
                new Response(JSON.stringify(embeddingResponse)),
        );
        vi.stubGlobal("fetch", fetchMock);

        await createEmbeddingsCommand().parseAsync(
            ["first text", "second text"],
            { from: "user" },
        );

        expect(output.join("")).toBe(
            `${JSON.stringify([0.1, 0.2, 0.3])}\n${JSON.stringify([0.4, 0.5])}\n`,
        );

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://gen.pollinations.ai/v1/embeddings");
        expect(init.method).toBe("POST");
        expect(JSON.parse(String(init.body))).toEqual({
            input: ["first text", "second text"],
        });
        expect(new Headers(init.headers).get("authorization")).toBe(
            "Bearer sk_test",
        );
    });

    it("forwards model, dimensions and retrieval hints", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: true,
        });
        setKeyOverride("sk_test");
        const fetchMock = vi.fn(
            async (_url: string, _init?: RequestInit) =>
                new Response(JSON.stringify(embeddingResponse)),
        );
        vi.stubGlobal("fetch", fetchMock);

        await createEmbeddingsCommand().parseAsync(
            [
                "hello",
                "--model",
                "google/gemini-embedding-2",
                "--dimensions",
                "1536",
                "--task-type",
                "SEMANTIC_SIMILARITY",
                "--input-type",
                "document",
            ],
            { from: "user" },
        );

        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(JSON.parse(String(init.body))).toEqual({
            input: ["hello"],
            model: "google/gemini-embedding-2",
            dimensions: 1536,
            task_type: "SEMANTIC_SIMILARITY",
            input_type: "document",
        });
    });

    it("reads one input per line from stdin", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: false,
        });
        setKeyOverride("sk_test");
        const output: string[] = [];
        vi.spyOn(process.stdout, "write").mockImplementation((value) => {
            if (value !== undefined && !String(value).includes("[async]"))
                output.push(String(value));
            return true;
        });
        const fetchMock = vi.fn(
            async (_url: string, _init?: RequestInit) =>
                new Response(JSON.stringify(embeddingResponse)),
        );
        vi.stubGlobal("fetch", fetchMock);
        vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(
            async function* () {
                yield Buffer.from("one\ntwo\n");
            },
        );

        await createEmbeddingsCommand().parseAsync([], { from: "user" });

        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(JSON.parse(String(init.body)).input).toEqual(["one", "two"]);
        expect(output).toHaveLength(2);
    });

    it("--json mode prints the full API response including usage", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: true,
        });
        Object.defineProperty(process.stdout, "isTTY", {
            configurable: true,
            value: false,
        });
        setKeyOverride("sk_test");
        setOutputMode("json");
        const output: string[] = [];
        vi.spyOn(process.stdout, "write").mockImplementation((value) => {
            output.push(String(value));
            return true;
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async (_url: string, _init?: RequestInit) =>
                    new Response(JSON.stringify(embeddingResponse)),
            ),
        );

        await createEmbeddingsCommand().parseAsync(["hello"], {
            from: "user",
        });

        const parsed = JSON.parse(output.join(""));
        expect(parsed.usage).toEqual({ prompt_tokens: 7, total_tokens: 7 });
        expect(parsed.data).toHaveLength(2);
    });
});

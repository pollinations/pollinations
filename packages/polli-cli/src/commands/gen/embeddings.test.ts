import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createEmbeddingsCommand } from "./embeddings.js";

const response = {
    object: "list" as const,
    data: [
        { object: "embedding" as const, embedding: [0.1, 0.2], index: 0 },
        { object: "embedding" as const, embedding: [0.3, 0.4], index: 1 },
    ],
    model: "google/gemini-embedding-2",
    usage: { prompt_tokens: 4, total_tokens: 4 },
};

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

describe("gen embeddings", () => {
    it("sends one request per call and prints one vector per line", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: true,
        });
        setKeyOverride("sk_test");
        setOutputMode("human");
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

        await createEmbeddingsCommand().parseAsync(
            [
                "first text",
                "second text",
                "--model",
                "google/gemini-embedding-2",
            ],
            { from: "user" },
        );

        expect(requests[0]).toEqual({
            input: ["first text", "second text"],
            model: "google/gemini-embedding-2",
        });
        expect(output).toEqual(["[0.1,0.2]\n", "[0.3,0.4]\n"]);
    });

    it("prints the full response with --json", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: true,
        });
        setKeyOverride("sk_test");
        setOutputMode("json");
        const output: string[] = [];
        vi.spyOn(process.stdout, "write").mockImplementation((value) => {
            output.push(String(value));
            return true;
        });
        vi.stubGlobal("fetch", async () => Response.json(response));

        await createEmbeddingsCommand().parseAsync(["hi"], { from: "user" });

        expect(JSON.parse(output.join(""))).toEqual(response);
    });
});

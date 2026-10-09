import { afterEach, describe, expect, it, vi } from "vitest";
import { handleMcpRequest } from "../src/mcp";
import type { Env } from "../src/types";

const env = {
    GEN_ORIGIN: "https://gen.pollinations.ai",
} as Env;

async function mcp(method: string, params?: unknown) {
    const response = await handleMcpRequest(
        new Request("https://mcp.pollinations.ai/mcp", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }),
        env,
        "sk_user_secret",
    );
    expect(response.status).toBe(200);
    return response.json() as Promise<{
        result: { tools?: { name: string }[]; content?: unknown[] };
    }>;
}

afterEach(() => vi.restoreAllMocks());

describe("hosted MCP tools", () => {
    it("exposes the concise eight-tool surface", async () => {
        const response = await mcp("tools/list");
        expect(response.result.tools?.map(({ name }) => name)).toEqual([
            "listModels",
            "chatCompletion",
            "generateImage",
            "generateVideo",
            "textToSpeech",
            "transcribeAudio",
            "getBalance",
            "getUsage",
        ]);
    });

    it("calls every Gen endpoint with the upstream sk_", async () => {
        const genRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                const url = new URL(request.url);
                if (url.hostname === "audio.example") {
                    return new Response(new Uint8Array([1, 2, 3]), {
                        headers: { "Content-Type": "audio/wav" },
                    });
                }
                genRequests.push(request);
                if (url.pathname === "/models")
                    return Response.json({ models: [] });
                if (url.pathname === "/v1/chat/completions") {
                    return Response.json({ choices: [] });
                }
                if (url.pathname.startsWith("/image/")) {
                    const isVideo =
                        url.searchParams.get("model") === "video-model";
                    return new Response(new Uint8Array([1, 2, 3]), {
                        headers: {
                            "Content-Type": isVideo ? "video/mp4" : "image/png",
                        },
                    });
                }
                if (url.pathname === "/v1/audio/speech") {
                    return new Response(new Uint8Array([1, 2, 3]), {
                        headers: { "Content-Type": "audio/mpeg" },
                    });
                }
                if (url.pathname === "/v1/audio/transcriptions") {
                    return Response.json({ text: "hello" });
                }
                if (url.pathname === "/account/balance") {
                    return Response.json({ balance: 5 });
                }
                if (url.pathname === "/account/key/usage") {
                    return Response.json({ usage: [] });
                }
                return new Response("unexpected request", { status: 500 });
            },
        );

        const calls = [
            ["listModels", {}],
            [
                "chatCompletion",
                { messages: [{ role: "user", content: "hello" }] },
            ],
            ["generateImage", { prompt: "bee", output: "inline" }],
            [
                "generateVideo",
                { prompt: "bee", model: "video-model", output: "inline" },
            ],
            ["textToSpeech", { input: "hello" }],
            [
                "transcribeAudio",
                { audioUrl: "https://audio.example/sample.wav" },
            ],
            ["getBalance", {}],
            ["getUsage", { days: 7 }],
        ] as const;

        for (const [name, args] of calls) {
            const response = await mcp("tools/call", { name, arguments: args });
            expect(response.result.content).toBeDefined();
        }

        expect(genRequests).toHaveLength(8);
        for (const request of genRequests) {
            expect(request.headers.get("authorization")).toBe(
                "Bearer sk_user_secret",
            );
        }
        const usageRequest = genRequests.at(-1);
        expect(usageRequest).toBeDefined();
        expect(
            new URL(usageRequest?.url ?? "https://invalid").searchParams.get(
                "days",
            ),
        ).toBe("7");
    });
});

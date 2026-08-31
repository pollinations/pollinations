import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: Server;
let fetchHarnessModels: typeof import("./models.js").fetchHarnessModels;
const previousBaseUrl = process.env.POLLINATIONS_BASE_URL;
const authorizationHeaders: (string | undefined)[] = [];

beforeAll(async () => {
    server = createServer((request, response) => {
        authorizationHeaders.push(request.headers.authorization);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
            JSON.stringify({
                data: [
                    {
                        id: "kimi",
                        input_modalities: ["text", "image"],
                        output_modalities: ["text"],
                        supported_endpoints: ["/v1/chat/completions"],
                        tools: true,
                        context_length: 262000,
                        reasoning: true,
                    },
                    {
                        id: "z-ai/glm-5.3-flash",
                        input_modalities: ["text"],
                        output_modalities: ["text"],
                        supported_endpoints: ["/v1/chat/completions"],
                        tools: true,
                        context_length: 128000,
                    },
                    {
                        id: "audio-model",
                        input_modalities: ["audio"],
                        output_modalities: ["text"],
                        supported_endpoints: ["/v1/chat/completions"],
                        tools: true,
                        context_length: 1000,
                    },
                    {
                        id: "realtime",
                        input_modalities: ["text"],
                        output_modalities: ["audio"],
                        supported_endpoints: ["/v1/realtime"],
                        tools: true,
                        context_length: 1000,
                    },
                    {
                        id: "agent-model",
                        input_modalities: ["text"],
                        output_modalities: ["text"],
                        supported_endpoints: ["/v1/chat/completions"],
                        tools: true,
                        context_length: 1000,
                        agent: { id: "agent" },
                    },
                    {
                        id: "owner/model",
                        input_modalities: ["text"],
                        output_modalities: ["text"],
                        supported_endpoints: ["/v1/chat/completions"],
                        tools: true,
                        context_length: 1000,
                    },
                    {
                        id: "bad-context",
                        input_modalities: ["text"],
                        output_modalities: ["text"],
                        supported_endpoints: ["/v1/chat/completions"],
                        tools: true,
                        context_length: Number.NaN,
                    },
                ],
            }),
        );
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("No test port");
    process.env.POLLINATIONS_BASE_URL = `http://127.0.0.1:${address.port}`;
    ({ fetchHarnessModels } = await import("./models.js"));
});

afterAll(async () => {
    if (previousBaseUrl === undefined) delete process.env.POLLINATIONS_BASE_URL;
    else process.env.POLLINATIONS_BASE_URL = previousBaseUrl;
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
});

describe("harness model catalog", () => {
    it("keeps only tool-capable chat models with valid modalities and context", async () => {
        await expect(fetchHarnessModels()).resolves.toEqual([
            {
                id: "kimi",
                contextWindow: 262000,
                input: ["text", "image"],
                reasoning: true,
            },
            {
                id: "z-ai/glm-5.3-flash",
                contextWindow: 128000,
                input: ["text"],
            },
            { id: "owner/model", contextWindow: 1000, input: ["text"] },
        ]);
    });

    it("passes a key for account-scoped model validation", async () => {
        await expect(fetchHarnessModels("sk_scoped")).resolves.toHaveLength(3);
        expect(authorizationHeaders).toEqual([undefined, "Bearer sk_scoped"]);
    });

    it("keeps public preflight requests explicitly anonymous", async () => {
        authorizationHeaders.length = 0;
        await fetchHarnessModels("");
        await fetchHarnessModels(null);
        await fetchHarnessModels(undefined);
        expect(authorizationHeaders).toEqual([undefined, undefined, undefined]);
    });
});

import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: Server;
let resolveHarnessKey: typeof import("./keys.js").resolveHarnessKey;
let fetchHarnessModels: typeof import("./models.js").fetchHarnessModels;
const requests: string[] = [];
const previousBaseUrl = process.env.POLLINATIONS_BASE_URL;

beforeAll(async () => {
    server = createServer((request, response) => {
        requests.push(`${request.method} ${request.url}`);
        if (request.url === "/v1/models") {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(
                JSON.stringify({
                    data: [
                        {
                            id: "chat",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            supported_endpoints: ["/v1/chat/completions"],
                            tools: true,
                            context_length: 100,
                        },
                        {
                            id: "publisher/chat",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            supported_endpoints: ["/v1/chat/completions"],
                            tools: true,
                            context_length: 200,
                        },
                        {
                            id: "owner/community-chat",
                            community: true,
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            supported_endpoints: ["/v1/chat/completions"],
                            tools: true,
                            context_length: 300,
                        },
                        {
                            id: "realtime",
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            supported_endpoints: ["/v1/realtime"],
                            tools: true,
                            context_length: 100,
                        },
                    ],
                }),
            );
            return;
        }
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end('{"error":"temporarily unavailable"}');
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("No test port");
    process.env.POLLINATIONS_BASE_URL = `http://127.0.0.1:${address.port}`;
    ({ resolveHarnessKey } = await import("./keys.js"));
    ({ fetchHarnessModels } = await import("./models.js"));
});

afterAll(async () => {
    if (previousBaseUrl === undefined) delete process.env.POLLINATIONS_BASE_URL;
    else process.env.POLLINATIONS_BASE_URL = previousBaseUrl;
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
});

describe("harness keys", () => {
    it("does not mint a replacement when validation is unavailable", async () => {
        await expect(
            resolveHarnessKey(
                {
                    id: "dsh",
                    label: "DeepSeek Harness",
                    existingKey: "sk_existing",
                },
                {},
            ),
        ).rejects.toMatchObject({ status: 503 });
        expect(requests).toEqual(["GET /account/key"]);
    });
});

describe("harness models", () => {
    it("only includes models supporting chat completions", async () => {
        await expect(fetchHarnessModels()).resolves.toEqual([
            { id: "chat", contextWindow: 100, input: ["text"] },
            {
                id: "publisher/chat",
                contextWindow: 200,
                input: ["text"],
            },
        ]);
    });
});

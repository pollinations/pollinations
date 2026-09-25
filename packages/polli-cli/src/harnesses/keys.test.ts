import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: Server;
let resolveHarnessKey: typeof import("./keys.js").resolveHarnessKey;
let fetchHarnessModels: typeof import("./models.js").fetchHarnessModels;
let config: typeof import("../lib/config.js");
const requests: string[] = [];
const mints: { auth?: string; body: unknown }[] = [];
const previousBaseUrl = process.env.POLLINATIONS_BASE_URL;
const previousApiKey = process.env.POLLINATIONS_API_KEY;

beforeAll(async () => {
    server = createServer((request, response) => {
        requests.push(`${request.method} ${request.url}`);
        if (request.method === "POST" && request.url === "/account/keys") {
            let raw = "";
            request.on("data", (chunk) => {
                raw += chunk;
            });
            request.on("end", () => {
                mints.push({
                    auth: request.headers.authorization,
                    body: JSON.parse(raw),
                });
                response.writeHead(200, {
                    "Content-Type": "application/json",
                });
                response.end('{"key":"sk_harness"}');
            });
            return;
        }
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
    config = await import("../lib/config.js");
});

afterAll(async () => {
    if (previousBaseUrl === undefined) delete process.env.POLLINATIONS_BASE_URL;
    else process.env.POLLINATIONS_BASE_URL = previousBaseUrl;
    if (previousApiKey === undefined) delete process.env.POLLINATIONS_API_KEY;
    else process.env.POLLINATIONS_API_KEY = previousApiKey;
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

    it("mints from POLLINATIONS_API_KEY without logging in", async () => {
        process.env.POLLINATIONS_API_KEY = "sk_machine";
        await expect(
            resolveHarnessKey(
                {
                    id: "opencode",
                    label: "OpenCode",
                    existingKey: null,
                    accountPermissions: ["profile", "usage"],
                },
                {},
            ),
        ).resolves.toBe("sk_harness");
        expect(mints).toEqual([
            {
                auth: "Bearer sk_machine",
                body: {
                    name: "polli-harness-opencode",
                    type: "secret",
                    accountPermissions: ["profile", "usage"],
                },
            },
        ]);
    });

    it("prefers an explicit key and --key over POLLINATIONS_API_KEY", () => {
        process.env.POLLINATIONS_API_KEY = "sk_machine";
        expect(config.resolveApiKey()).toBe("sk_machine");
        config.setKeyOverride("sk_flag");
        expect(config.resolveApiKey()).toBe("sk_flag");
        expect(config.resolveApiKey("sk_explicit")).toBe("sk_explicit");
        config.setKeyOverride(undefined);
    });
});

describe("harness models", () => {
    it("only includes models supporting chat completions", async () => {
        await expect(fetchHarnessModels("chat")).resolves.toEqual([
            { id: "chat", contextWindow: 100, input: ["text"] },
            {
                id: "publisher/chat",
                contextWindow: 200,
                input: ["text"],
            },
        ]);
    });

    it.each([
        "missing",
        "realtime",
        "owner/community-chat",
    ])("rejects an unavailable harness model: %s", async (model) => {
        await expect(fetchHarnessModels(model)).rejects.toThrow(
            `Model "${model}" is not a tool-calling text model. Run: polli models`,
        );
    });
});

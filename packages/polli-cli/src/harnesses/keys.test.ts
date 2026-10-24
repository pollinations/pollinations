import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: Server;
let resolveHarnessKey: typeof import("./keys.js").resolveHarnessKey;
let fetchHarnessModels: typeof import("./models.js").fetchHarnessModels;
let setKeyOverride: typeof import("../lib/config.js").setKeyOverride;
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
                            // Collides with the next model's exact ID.
                            aliases: ["publisher/chat"],
                            input_modalities: ["text"],
                            output_modalities: ["text"],
                            supported_endpoints: ["/v1/chat/completions"],
                            tools: true,
                            context_length: 100,
                        },
                        {
                            id: "publisher/chat",
                            aliases: ["chat-alias"],
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
        // The polli login on a Mac can create keys; the one gen writes into a
        // sandbox can't.
        const login = {
            "Bearer sk_mac_login": ["profile", "usage", "keys", "machines"],
            "Bearer sk_sandbox_login": ["profile", "usage", "machines"],
        }[request.headers.authorization ?? ""];
        if (request.url === "/account/key" && login) {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(
                JSON.stringify({
                    valid: true,
                    permissions: { account: login },
                }),
            );
            return;
        }
        if (request.method === "POST" && request.url === "/account/keys") {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end('{"key":"sk_harness"}');
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
    ({ setKeyOverride } = await import("../lib/config.js"));
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

    it.each([
        [
            "sk_mac_login",
            "sk_harness",
            ["GET /account/key", "POST /account/keys"],
        ],
        ["sk_sandbox_login", "sk_sandbox_login", ["GET /account/key"]],
    ])("with the login %s, the harness uses %s", async (login, key, calls) => {
        requests.length = 0;
        setKeyOverride(login);
        try {
            await expect(
                resolveHarnessKey(
                    { id: "pi", label: "Pi", existingKey: null },
                    {},
                ),
            ).resolves.toBe(key);
        } finally {
            setKeyOverride(undefined);
        }
        expect(requests).toEqual(calls);
    });
});

describe("harness models", () => {
    it("only includes models supporting chat completions", async () => {
        await expect(fetchHarnessModels("chat")).resolves.toEqual({
            model: "chat",
            models: [
                { id: "chat", contextWindow: 100, input: ["text"] },
                {
                    id: "publisher/chat",
                    contextWindow: 200,
                    input: ["text"],
                },
            ],
        });
    });

    it("resolves an alias to the canonical model ID", async () => {
        await expect(fetchHarnessModels("chat-alias")).resolves.toMatchObject({
            model: "publisher/chat",
        });
    });

    it("prefers an exact ID over another model's alias", async () => {
        await expect(
            fetchHarnessModels("publisher/chat"),
        ).resolves.toMatchObject({ model: "publisher/chat" });
    });

    it.each(["missing", "realtime", "owner/community-chat"])(
        "rejects an unavailable harness model: %s",
        async (model) => {
            await expect(fetchHarnessModels(model)).rejects.toThrow(
                `Model "${model}" is not a tool-calling text model. Run: polli models`,
            );
        },
    );
});

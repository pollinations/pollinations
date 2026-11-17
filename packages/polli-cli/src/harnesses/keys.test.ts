import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";
import type { HarnessContext } from "./types.js";

let server: Server;
let resolveHarnessKey: typeof import("./keys.js").resolveHarnessKey;
let fetchHarnessModels: typeof import("./models.js").fetchHarnessModels;
let setKeyOverride: typeof import("../lib/config.js").setKeyOverride;
const requests: string[] = [];
const createdNames: string[] = [];
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
        // sandbox can't, and one with a budget would have to split it.
        const login = {
            "Bearer sk_mac_login": ["profile", "usage", "keys", "machines"],
            "Bearer sk_sandbox_login": ["profile", "usage", "machines"],
            "Bearer sk_budget_login": ["profile", "usage", "keys", "machines"],
        }[request.headers.authorization ?? ""];
        if (request.url === "/account/key" && login) {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(
                JSON.stringify({
                    valid: true,
                    permissions: { account: login },
                    pollenBudget:
                        request.headers.authorization ===
                        "Bearer sk_budget_login"
                            ? 5
                            : null,
                }),
            );
            return;
        }
        if (request.method === "POST" && request.url === "/account/keys") {
            let body = "";
            request.on("data", (chunk) => {
                body += chunk;
            });
            request.on("end", () => {
                createdNames.push(JSON.parse(body).name);
                response.writeHead(200, { "Content-Type": "application/json" });
                response.end('{"key":"sk_harness"}');
            });
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

describe("Vibe setup with the harness API helpers", () => {
    let home: string;
    let ctx: HarnessContext;
    beforeEach(() => {
        home = mkdtempSync(join(tmpdir(), "polli-vibe-on-"));
        const bin = join(home, "bin");
        mkdirSync(bin);
        writeFileSync(
            join(bin, process.platform === "win32" ? "vibe.exe" : "vibe"),
            "",
            { mode: 0o755 },
        );
        ctx = { home, env: { PATH: bin, PATHEXT: ".EXE" } };
        requests.length = 0;
        createdNames.length = 0;
        setKeyOverride("sk_mac_login");
    });
    afterEach(() => {
        setKeyOverride(undefined);
        requests.length = 0;
        rmSync(home, { recursive: true, force: true });
    });

    it("resolves model aliases, creates a dedicated Vibe key and configures the catalog", async () => {
        const { vibe } = await import("./vibe.js");
        await expect(
            vibe.on(ctx, { model: "chat-alias", browser: false }),
        ).resolves.toMatchObject({ configured: true, model: "publisher/chat" });
        expect(requests).toEqual([
            "GET /v1/models",
            "GET /account/key",
            "POST /account/keys",
        ]);
        expect(createdNames).toEqual(["polli-harness-vibe"]);
        const config = parse(
            readFileSync(join(home, ".vibe", "config.toml"), "utf8"),
        );
        expect(config.models).toHaveLength(2);
        expect(config.active_model).toBe("pollinations/publisher/chat");
        expect(vibe.off(ctx).outcome).toBe("restored");
    });

    it("rejects conflicting configuration before requesting a new key", async () => {
        const { vibe } = await import("./vibe.js");
        mkdirSync(join(home, ".vibe"));
        writeFileSync(
            join(home, ".vibe", "config.toml"),
            '[[providers]]\nname = "pollinations"\napi_base = "https://example.com/v1"\n',
        );
        await expect(vibe.on(ctx, { model: "chat" })).rejects.toThrow(
            "different settings",
        );
        expect(requests).toEqual(["GET /v1/models"]);
        expect(createdNames).toEqual([]);
    });
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
        ["sk_budget_login", "sk_budget_login", ["GET /account/key"]],
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

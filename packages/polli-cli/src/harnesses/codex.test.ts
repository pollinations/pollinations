import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { HarnessContext } from "./types.js";

const ROUTER_SCRIPT = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const raw = process.argv.slice(2);
const args = raw[0] === "codex" ? raw.slice(1) : raw;
const stateDir = process.env.MODEL_ROUTER_STATE_DIR ||
    path.join(process.env.CODEX_HOME || require("node:os").homedir(), "codex-router");
const rel = (file) => path.join(stateDir, file);
const readJson = (file, fallback) => {
    try { return JSON.parse(fs.readFileSync(rel(file), "utf-8")); } catch { return fallback; }
};
const writeJson = (file, data) => {
    fs.mkdirSync(path.dirname(rel(file)), { recursive: true });
    fs.writeFileSync(rel(file), JSON.stringify(data, null, 2));
};
const [sub] = args;
if (sub === "providers") {
    const [, action, id] = args;
    if (action === "generic") {
        const [, , genericAction, genericId] = args;
        if (genericAction === "show") {
            const provider = readJson("generic-providers.json", { providers: [] }).providers.find(
                (p) => p.id === genericId,
            );
            if (!provider) { console.error("Unknown generic provider."); process.exit(1); }
            process.stdout.write(JSON.stringify({ provider }) + "\\n");
            return;
        }
        if (genericAction === "add" || genericAction === "edit") {
            const providers = readJson("generic-providers.json", { providers: [] }).providers;
            const descriptor = {
                id: genericId,
                displayName: "Pollinations",
                baseUrl: "https://gen.pollinations.ai/v1",
                adapter: "openai-chat",
                enabled: true,
            };
            const index = providers.findIndex((p) => p.id === genericId);
            if (index >= 0) providers[index] = { ...providers[index], ...descriptor };
            else providers.push(descriptor);
            writeJson("generic-providers.json", { providers });
            console.log("ok");
            return;
        }
        if (genericAction === "remove") {
            writeJson("generic-providers.json", {
                providers: readJson("generic-providers.json", { providers: [] }).providers.filter(
                    (p) => p.id !== genericId,
                ),
            });
            fs.rmSync(rel(path.join("generic-provider-credentials", genericId + ".key")), { force: true });
            console.log("removed");
            return;
        }
        if (genericAction === "credential") {
            const credentialId = args[3];
            const credentialAction = args[4];
            if (credentialAction === "set") {
                let input = "";
                process.stdin.on("data", (chunk) => { input += chunk; });
                process.stdin.on("end", () => {
                    fs.mkdirSync(rel("generic-provider-credentials"), { recursive: true });
                    fs.writeFileSync(
                        rel(path.join("generic-provider-credentials", credentialId + ".key")),
                        input.trim(),
                    );
                    console.log("credential saved");
                });
                return;
            }
        }
    }
    if (action === "enable") {
        const providers = readJson("generic-providers.json", { providers: [] }).providers;
        const provider = providers.find((p) => p.id === args[2]);
        if (provider) { provider.enabled = true; writeJson("generic-providers.json", { providers }); }
        console.log("enabled");
        return;
    }
}
console.error("unexpected fake router args: " + args.join(" "));
process.exit(2);
`;

const CURATE_SCRIPT = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
if (process.env.FAKE_CURATE_FAILS === "1") {
    console.error("curate failed (simulated)");
    process.exit(3);
}
const provider = process.argv[2];
const modelsIndex = process.argv.indexOf("--models");
const models = modelsIndex >= 0 ? process.argv[modelsIndex + 1].split(",") : [];
const stateDir = process.env.MODEL_ROUTER_STATE_DIR ||
    path.join(process.env.CODEX_HOME || require("node:os").homedir(), "codex-router");
const file = path.join(stateDir, "user-models.json");
const current = (() => { try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return { version: 1, models: [] }; } })();
const models_ = current.models ?? [];
for (const model of models) {
    if (!models_.some((m) => m.slug === "pollinations/" + model)) {
        models_.push({ slug: "pollinations/" + model, provider, upstreamModel: model });
    }
}
current.version = 1;
current.models = models_;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(current, null, 2));
console.log("curated");
`;

const CODEX_SCRIPT = `#!/usr/bin/env node
process.stdout.write("codex\\npong\\ntokens used\\n12\\n");
`;

const settings = { apiKey: "sk_test_key", model: "chat" };

let home: string;
let binDir: string;
let ctx: HarnessContext;

// The adapter validates the selected model against the live catalog and
// reuses/mints the dedicated key through the same base URL, so the tests
// point the API at a local mock (same pattern as keys.test.ts).
let server: Server;
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
                    ],
                }),
            );
            return;
        }
        if (request.url === "/account/key") {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ valid: true }));
            return;
        }
        if (request.url === "/account/keys" && request.method === "POST") {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ key: "sk_mock_child_key" }));
            return;
        }
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end("{}");
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    process.env.POLLINATIONS_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
    if (previousBaseUrl === undefined) {
        delete process.env.POLLINATIONS_BASE_URL;
    } else {
        process.env.POLLINATIONS_BASE_URL = previousBaseUrl;
    }
    await new Promise<void>((resolve) => server.close(resolve));
});
const codexHome = () => join(home, ".codex");
const stateDir = () => join(codexHome(), "codex-router");
const keyFile = () =>
    join(stateDir(), "generic-provider-credentials", "pollinations.key");
const watchedFiles = () => [
    join(codexHome(), "config.toml"),
    join(stateDir(), "generic-providers.json"),
    join(stateDir(), "provider-credentials.json"),
    join(stateDir(), "enabled-providers.json"),
    join(stateDir(), "user-models.json"),
    keyFile(),
];

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    binDir = join(home, "bin");
    mkdirSync(binDir, { recursive: true });
    for (const [name, script] of [
        ["model-router", ROUTER_SCRIPT],
        ["curate-models", CURATE_SCRIPT],
        ["codex", CODEX_SCRIPT],
    ] as const) {
        const path = join(binDir, name);
        writeFileSync(path, script);
        chmodSync(path, 0o755);
    }
    writeFileSync(join(binDir, ".keep"), "");
    ctx = {
        home,
        env: { PATH: `${binDir}:${process.env.PATH ?? ""}` },
    };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("codex harness", () => {
    it("connects through the router's own commands and reports the curated model", async () => {
        const { codex } = await import("./codex.js");
        const result = await codex.on(ctx, { model: settings.model });
        expect(result.configured).toBe(true);
        expect(result.model).toBe(settings.model);
        // Fresh setup: a dedicated child key was minted and stored in the
        // router's own protected credential file.
        expect(readFileSync(keyFile(), "utf-8")).toBe("sk_mock_child_key");
        expect(readFileSync(join(stateDir(), "user-models.json"), "utf-8")).toContain(
            `pollinations/${settings.model}`,
        );
        // Credential traveled over stdin: never embedded in a descriptor.
        expect(readFileSync(join(stateDir(), "generic-providers.json"), "utf-8")).not.toContain(
            settings.apiKey,
        );
    });

    it("rejects a missing codex client before any login or config change", async () => {
        const { codex } = await import("./codex.js");
        const isolated = { home, env: { PATH: join(home, "empty") } };
        await expect(codex.on(isolated, {})).rejects.toThrow(/npm install -g @openai\/codex/);
        expect(existsSync(stateDir())).toBe(false);
    });

    it("rejects a missing router before any login or config change", async () => {
        const { codex } = await import("./codex.js");
        const onlyCodex = join(home, "only-codex");
        mkdirSync(onlyCodex, { recursive: true });
        const codexPath = join(onlyCodex, "codex");
        writeFileSync(codexPath, "#!/bin/sh\necho pong\n");
        chmodSync(codexPath, 0o755);
        const isolated = { home, env: { PATH: onlyCodex } };
        await expect(codex.on(isolated, {})).rejects.toThrow(/Codex Router was not found/);
        expect(existsSync(stateDir())).toBe(false);
    });

    it("rolls the router state back byte-for-byte when a step fails", async () => {
        const { codex } = await import("./codex.js");
        await codex.on(ctx, { model: settings.model });
        const before = readFileSync(join(stateDir(), "generic-providers.json"), "utf-8");
        const keyBefore = readFileSync(keyFile(), "utf-8");

        const failing: HarnessContext = {
            ...ctx,
            env: { ...ctx.env, FAKE_CURATE_FAILS: "1" },
        };
        await expect(codex.on(failing, { model: "other" })).rejects.toThrow();
        expect(readFileSync(join(stateDir(), "generic-providers.json"), "utf-8")).toBe(before);
        expect(readFileSync(keyFile(), "utf-8")).toBe(keyBefore);
        expect(readFileSync(join(stateDir(), "user-models.json"), "utf-8")).not.toContain(
            "pollinations/other",
        );
    });

    it("restores the untouched router state byte-for-byte on off", async () => {
        const { codex } = await import("./codex.js");
        const before = new Map(
            watchedFiles().map((path) => [
                path,
                existsSync(path) ? readFileSync(path, "utf-8") : null,
            ]),
        );
        await codex.on(ctx, { model: settings.model });
        const result = codex.off(ctx);
        expect(result.outcome).toBe("restored");
        for (const [path, original] of before) {
            expect(existsSync(path)).toBe(original !== null);
            if (original !== null) expect(readFileSync(path, "utf-8")).toBe(original);
        }
        expect(codex.status(ctx).configured).toBe(false);
    });

    it("strips only Pollinations entries when the user edited the state afterwards", async () => {
        const { codex } = await import("./codex.js");
        await codex.on(ctx, { model: settings.model });
        // The user's own provider, added after our `on`.
        const providersPath = join(stateDir(), "generic-providers.json");
        const parsed = JSON.parse(readFileSync(providersPath, "utf-8"));
        parsed.providers.push({ id: "friend-provider", displayName: "Friend" });
        writeFileSync(providersPath, JSON.stringify(parsed, null, 2));

        const result = codex.off(ctx);
        expect(result.outcome).toBe("stripped");
        const after = JSON.parse(readFileSync(providersPath, "utf-8"));
        expect(after.providers.some((p: { id: string }) => p.id === "friend-provider")).toBe(true);
        expect(after.providers.some((p: { id: string }) => p.id === "pollinations")).toBe(false);
        expect(existsSync(keyFile())).toBe(false);
    });

    it("reports an unconfigured status before on", async () => {
        const { codex } = await import("./codex.js");
        expect(codex.status(ctx).configured).toBe(false);
    });

    it("refuses to configure a router installed with --no-discovery", async () => {
        const { codex } = await import("./codex.js");
        mkdirSync(stateDir(), { recursive: true });
        writeFileSync(
            join(stateDir(), "discovery-mode.json"),
            JSON.stringify({ version: 1, discovery: "disabled" }),
        );
        await expect(codex.on(ctx, {})).rejects.toThrow(/--no-discovery/);
    });

    it("reuses the key already stored by the router instead of minting a new one", async () => {
        const { codex } = await import("./codex.js");
        await codex.on(ctx, { model: settings.model });
        const stored = readFileSync(keyFile(), "utf-8");
        const before = requests.filter((r) => r.includes("/account/keys")).length;
        await codex.on(ctx, { model: settings.model });
        const after = requests.filter((r) => r.includes("/account/keys")).length;
        expect(after).toBe(before);
        expect(readFileSync(keyFile(), "utf-8")).toBe(stored);
    });
});

import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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

const settings = { apiKey: "sk_test_key", model: "chat" };

let home: string;
let binDir: string;
let ctx: HarnessContext;

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

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    binDir = join(home, "bin");
    mkdirSync(binDir, { recursive: true });
    // Fake ccr: "starts" but never serves a gateway, so the smoke path
    // takes its skip branch and the config write is still exercised.
    const ccrPath = join(binDir, "ccr");
    writeFileSync(
        ccrPath,
        "#!/usr/bin/env node\nif (process.argv[2] === 'start') process.stdout.write('started');\n",
    );
    chmodSync(ccrPath, 0o755);
    ctx = {
        home,
        env: { PATH: `${binDir}:${process.env.PATH ?? ""}` },
    };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configDb = () =>
    join(
        process.platform === "win32"
            ? join(home, "AppData", "Roaming", "claude-code-router")
            : join(home, ".claude-code-router"),
        "config.sqlite",
    );

/** Open the sandbox sqlite the way CCR does and read the document. */
const loadDoc = (): {
    Providers: Array<Record<string, unknown>>;
    profile: { profiles: Array<Record<string, unknown>> };
} => {
    const db = new DatabaseSync(configDb());
    try {
        const row = db
            .prepare("SELECT value_json FROM app_config WHERE key = 'default'")
            .get() as { value_json: string } | undefined;
        return row
            ? JSON.parse(row.value_json)
            : { Providers: [], profile: { profiles: [] } };
    } finally {
        db.close();
    }
};

const seedDoc = (
    mutate: (doc: {
        Providers: Array<Record<string, unknown>>;
        profile: { profiles: Array<Record<string, unknown>> };
    }) => void,
) => {
    mkdirSync(join(configDb(), ".."), { recursive: true });
    const db = new DatabaseSync(configDb());
    try {
        db.exec(
            "CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);",
        );
        const seed = {
            Providers: [
                {
                    name: "openrouter",
                    api_base_url: "https://openrouter.example/api",
                    api_key: "sk_friend",
                    models: ["friend/model"],
                    enabled: true,
                },
            ],
            profile: {
                enabled: true,
                profiles: [
                    {
                        id: "work",
                        name: "Work",
                        agent: "claude-code",
                        scope: "ccr",
                        enabled: true,
                        model: "openrouter/friend/model",
                    },
                ],
            },
        } as Record<string, unknown>;
        mutate(seed as never);
        db.prepare(
            "INSERT OR REPLACE INTO app_config (key, value_json, updated_at) VALUES ('default', ?, ?)",
        ).run(JSON.stringify(seed), new Date().toISOString());
    } finally {
        db.close();
    }
};

// The smoke path polls a (never-appearing) gateway, so each `on` costs
// several seconds; give the suite headroom under parallel test load.
describe("claude-code harness", { timeout: 30_000 }, () => {
    it("writes provider, isolated profile, and gateway keys into CCR's own config", async () => {
        const { claudeCode } = await import("./claude-code.js");
        const result = await claudeCode.on(ctx, { model: settings.model });
        expect(result.configured).toBe(true);
        expect(result.model).toBe(settings.model);
        expect(existsSync(configDb())).toBe(true);

        const doc = loadDoc();
        const provider = doc.Providers.find((p) => p.name === "pollinations");
        expect(provider?.api_base_url).toBe("https://gen.pollinations.ai/v1");
        expect(provider?.api_key).toBe("sk_mock_child_key");
        expect(provider?.models).toContain(settings.model);

        const profile = doc.profile.profiles.find(
            (p) => p.id === "pollinations",
        );
        expect(profile?.agent).toBe("claude-code");
        expect(profile?.scope).toBe("ccr");
        expect(profile?.model).toBe(`pollinations/${settings.model}`);

        // The user's ~/.claude is never a file of this harness.
        expect(result.files).toEqual([configDb()]);
        expect(existsSync(join(home, ".claude"))).toBe(false);
    });

    it("leaves pre-existing providers, profiles, and keys untouched", async () => {
        const { claudeCode } = await import("./claude-code.js");
        seedDoc(() => {});
        await claudeCode.on(ctx, { model: settings.model });
        const doc = loadDoc();
        expect(doc.Providers.some((p) => p.name === "openrouter")).toBe(true);
        expect(doc.profile.profiles.some((p) => p.id === "work")).toBe(true);
    });

    it("restores the config database byte-for-byte on off", async () => {
        const { claudeCode } = await import("./claude-code.js");
        seedDoc(() => {});
        const before = readFileSync(configDb());
        await claudeCode.on(ctx, { model: settings.model });
        const result = await claudeCode.off(ctx);
        expect(result.outcome).toBe("restored");
        expect(readFileSync(configDb()).equals(before)).toBe(true);
        expect(claudeCode.status(ctx).configured).toBe(false);
    });

    it("strips only Pollinations entries when the user edited the config afterwards", async () => {
        const { claudeCode } = await import("./claude-code.js");
        seedDoc(() => {});
        await claudeCode.on(ctx, { model: settings.model });
        // The user added their own provider after our `on`.
        const db = new DatabaseSync(configDb());
        const row = db
            .prepare("SELECT value_json FROM app_config WHERE key = 'default'")
            .get() as { value_json: string };
        const doc = JSON.parse(row.value_json);
        doc.Providers.push({
            name: "friend",
            api_base_url: "https://friend.example",
            api_key: "sk_friend2",
            models: [],
        });
        db.prepare(
            "UPDATE app_config SET value_json = ? WHERE key = 'default'",
        ).run(JSON.stringify(doc));
        db.close();

        const result = await claudeCode.off(ctx);
        expect(result.outcome).toBe("stripped");
        const after = loadDoc();
        expect(after.Providers.some((p) => p.name === "friend")).toBe(true);
        expect(after.Providers.some((p) => p.name === "pollinations")).toBe(
            false,
        );
        expect(
            after.profile.profiles.some((p) => p.id === "pollinations"),
        ).toBe(false);
        expect(after.profile.profiles.some((p) => p.id === "work")).toBe(true);
    });

    it("reuses the key already stored for the harness instead of minting a new one", async () => {
        const { claudeCode } = await import("./claude-code.js");
        seedDoc((doc) => {
            doc.Providers.push({
                name: "pollinations",
                api_base_url: "https://gen.pollinations.ai/v1",
                api_key: settings.apiKey,
                models: [],
                enabled: true,
            });
        });
        const before = requests.filter((r) =>
            r.includes("/account/keys"),
        ).length;
        await claudeCode.on(ctx, { model: settings.model });
        const after = requests.filter((r) =>
            r.includes("/account/keys"),
        ).length;
        expect(after).toBe(before);
        expect(
            loadDoc().Providers.find((p) => p.name === "pollinations")?.api_key,
        ).toBe(settings.apiKey);
    });

    it("reports an unconfigured status before on", async () => {
        const { claudeCode } = await import("./claude-code.js");
        expect(claudeCode.status(ctx).configured).toBe(false);
    });

    it("refuses a missing Claude Code client before any login or config change", async () => {
        const { claudeCode } = await import("./claude-code.js");
        const isolated = { home, env: { PATH: join(home, "empty") } };
        await expect(claudeCode.on(isolated, {})).rejects.toThrow(
            /npm install -g @anthropic-ai\/claude-code/,
        );
        expect(existsSync(configDb())).toBe(false);
    });

    it("refuses a missing router before any login or config change", async () => {
        const { claudeCode } = await import("./claude-code.js");
        const onlyClaude = join(home, "only-claude");
        mkdirSync(onlyClaude, { recursive: true });
        const claudePath = join(onlyClaude, "claude");
        writeFileSync(claudePath, "#!/bin/sh\nexit 0\n");
        chmodSync(claudePath, 0o755);
        const isolated = { home, env: { PATH: onlyClaude } };
        await expect(claudeCode.on(isolated, {})).rejects.toThrow(
            /Claude Code Router was not found/,
        );
        expect(existsSync(configDb())).toBe(false);
    });
});

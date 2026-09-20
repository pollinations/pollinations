import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CcrConfig, ccrDir } from "./ccr.js";
import { claudeCode, configureClaudeCode } from "./claude-code.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "z-ai/glm-5.3-flash", contextWindow: 200000, input: ["text"] },
    { id: "openai/gpt-5.4-nano", contextWindow: 400000, input: ["text"] },
];
const settings = { apiKey: "sk_dedicated", model: models[0].id, models };

const nativeProfile = {
    id: "default-claude-code",
    name: "Claude Code",
    agent: "claude-code",
    enabled: true,
    scope: "global",
    model: "",
};
const foreign = {
    id: "provider-openrouter-1",
    name: "openrouter",
    api_base_url: "https://openrouter.ai/api/v1",
    api_key: "sk-or-user",
    models: ["a/b"],
};

let home: string;
let ctx: HarnessContext;
let server: Server;
let config: CcrConfig;
let smokeStatus: number;
let smokeModels: string[];

const executable = (dir: string, name: string) => {
    const file = join(dir, process.platform === "win32" ? `${name}.cmd` : name);
    writeFileSync(file, "");
    chmodSync(file, 0o755);
};

beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), "polli-ccr-"));
    smokeStatus = 200;
    smokeModels = [];
    config = {
        APIKEY: "sk-ccr-local",
        Providers: [structuredClone(foreign)],
        profile: { profiles: [structuredClone(nativeProfile)] },
    };
    server = createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
        });
        req.on("end", () => {
            const send = (status: number, value: unknown) => {
                res.writeHead(status, { "content-type": "application/json" });
                res.end(JSON.stringify(value));
            };
            if (req.url === "/v1/messages") {
                smokeModels.push(JSON.parse(body).model);
                return smokeStatus === 200
                    ? send(200, { content: [{ type: "text", text: "pong" }] })
                    : send(smokeStatus, { error: { message: "no route" } });
            }
            const { method, args } = JSON.parse(body);
            if (method === "saveConfig") config = args[0];
            if (method === "getGatewayStatus") {
                const { port } = server.address() as { port: number };
                return send(200, {
                    ok: true,
                    value: { endpoint: `http://127.0.0.1:${port}` },
                });
            }
            send(200, { ok: true, value: config });
        });
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as { port: number };
    const bin = join(home, "bin");
    mkdirSync(bin);
    executable(bin, "ccr");
    executable(bin, "claude");
    ctx = { home, env: { APPDATA: home, PATH: bin } };
    mkdirSync(ccrDir(ctx), { recursive: true });
    writeFileSync(
        join(ccrDir(ctx), "service.json"),
        JSON.stringify({
            pid: process.pid,
            url: `http://127.0.0.1:${port}/?ccr_web_token=tok`,
        }),
    );
});

afterEach(() => {
    server.close();
    rmSync(home, { recursive: true, force: true });
});

const owned = () => ({
    provider: config.Providers.find((p) => p.name === "pollinations"),
    profile: config.profile.profiles.find(
        (p) => p.id === "pollinations-claude-code",
    ),
});

describe("claude-code adapter", () => {
    it("stops before any login when the router or the client is missing", async () => {
        await expect(
            claudeCode.on({ ...ctx, env: { ...ctx.env, PATH: "" } }, {}),
        ).rejects.toThrow("npm install -g @musistudio/claude-code-router");
        rmSync(
            join(
                home,
                "bin",
                process.platform === "win32" ? "claude.cmd" : "claude",
            ),
        );
        await expect(claudeCode.on(ctx, {})).rejects.toThrow(
            "Claude Code was not found",
        );
    });

    it("asks for a running router instead of starting one", async () => {
        rmSync(join(ccrDir(ctx), "service.json"));
        await expect(configureClaudeCode(ctx, settings)).rejects.toThrow(
            "Start it first: ccr start",
        );
        expect(await claudeCode.status(ctx)).toMatchObject({
            configured: false,
            details: { service: false, next: "Start the router: ccr start" },
        });
    });

    it("adds a Pollinations provider and an isolated profile, leaving the rest alone", async () => {
        await configureClaudeCode(ctx, settings);
        const { provider, profile } = owned();
        expect(provider).toMatchObject({
            api_base_url: "https://gen.pollinations.ai/v1",
            api_key: "sk_dedicated",
            models: models.map((m) => m.id),
        });
        expect(profile).toMatchObject({
            enabled: true,
            scope: "ccr",
            model: "openai/z-ai/glm-5.3-flash",
        });
        expect(config.Providers).toContainEqual(foreign);
        expect(config.profile.profiles).toContainEqual(nativeProfile);
        expect(smokeModels).toEqual(["openai/z-ai/glm-5.3-flash"]);
    });

    it("re-running updates in place: one provider, one profile, new model", async () => {
        await configureClaudeCode(ctx, settings);
        await configureClaudeCode(ctx, { ...settings, model: models[1].id });
        expect(
            config.Providers.filter((p) => p.name === "pollinations"),
        ).toHaveLength(1);
        expect(
            config.profile.profiles.filter(
                (p) => p.id === "pollinations-claude-code",
            ),
        ).toHaveLength(1);
        expect(owned().profile?.model).toBe("openai/openai/gpt-5.4-nano");
        expect((await claudeCode.status(ctx)).model).toBe(
            "openai/gpt-5.4-nano",
        );
    });

    it("rolls the router config back when the smoke test fails", async () => {
        const before = structuredClone(config);
        smokeStatus = 400;
        await expect(configureClaudeCode(ctx, settings)).rejects.toThrow(
            "Smoke test through Claude Code Router failed",
        );
        expect(config).toEqual(before);
    });

    it("off removes only Pollinations-owned entries, even after outside edits", async () => {
        await configureClaudeCode(ctx, settings);
        config.Providers.push({ ...foreign, id: "added-later", name: "later" });
        const result = await claudeCode.off(ctx);
        expect(result.outcome).toBe("stripped");
        expect(owned().provider).toBeUndefined();
        expect(owned().profile).toBeUndefined();
        expect(config.Providers.map((p) => p.name)).toEqual([
            "openrouter",
            "later",
        ]);
        expect(config.profile.profiles).toEqual([nativeProfile]);
        expect((await claudeCode.off(ctx)).outcome).toBe("unchanged");
    });

    it("status reports readiness and the missing prerequisite", async () => {
        expect((await claudeCode.status(ctx)).configured).toBe(false);
        await configureClaudeCode(ctx, settings);
        expect(await claudeCode.status(ctx)).toMatchObject({
            configured: true,
            model: "z-ai/glm-5.3-flash",
            details: {
                router: true,
                client: true,
                service: true,
                provider: true,
                profile: true,
            },
        });
        const missing = await claudeCode.status({
            ...ctx,
            env: { APPDATA: home, PATH: "" },
        });
        expect(missing.details).toMatchObject({
            router: false,
            next: expect.stringContaining(
                "npm install -g @musistudio/claude-code-router",
            ),
        });
    });
});

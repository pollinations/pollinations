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
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    codex,
    codexHome,
    codexRouterStateDir,
    configureCodex,
    disableCodex,
} from "./codex.js";
import type { HarnessContext } from "./types.js";

const settings = { apiKey: "sk_test_key", model: "openai/gpt-5.4-nano" };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-codex-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const stateDir = () => join(home, ".codex", "codex-router");
const providersFile = () => join(stateDir(), "generic-providers.json");
const credentialStoreFile = () => join(stateDir(), "provider-credentials.json");
const secretFile = () =>
    join(stateDir(), "generic-provider-credentials", "pollinations.key");
const tomlFile = () => join(home, ".codex", "config.toml");
const read = (path: string) => readFileSync(path, "utf-8");
const readJson = (path: string) =>
    JSON.parse(read(path)) as Record<string, unknown>;

/** A fake `codex` binary (only needs to exist for `commandExists`) and a fake
 * `codex-router` that behaves just enough like the real CLI: `control
 * client-setup codex` writes the router-managed TOML marker, and
 * `discover-models` / `control model-set` succeed and record their calls. */
const installFakeTools = () => {
    const binDir = join(home, "bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, "codex"), "#!/bin/sh\nexit 0\n");
    chmodSync(join(binDir, "codex"), 0o755);
    writeFileSync(
        join(binDir, "codex-router"),
        `#!/usr/bin/env node
const { appendFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const home = process.env.CODEX_HOME || join(process.env.HOME, ".codex");
const calls = join(home, "codex-router", "calls.log");
mkdirSync(dirname(calls), { recursive: true });
appendFileSync(calls, process.argv.slice(2).join(" ") + "\\n");
if (process.argv[2] === "control" && process.argv[3] === "client-setup") {
  const toml = join(home, "config.toml");
  mkdirSync(home, { recursive: true });
  appendFileSync(toml, "\\n# BEGIN codex-router-managed\\n# END codex-router-managed\\n");
}
process.exit(0);
`,
    );
    chmodSync(join(binDir, "codex-router"), 0o755);
    ctx.env = {
        ...process.env,
        HOME: home,
        PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
    };
};

const callsLog = () => {
    const path = join(stateDir(), "calls.log");
    return existsSync(path) ? read(path).trim().split("\n") : [];
};

describe("codex harness", () => {
    it("writes the generic provider, credential, and secret from scratch", () => {
        installFakeTools();
        const result = configureCodex(ctx, settings);
        expect(result).toMatchObject({ harness: "codex", configured: true });

        const providers = readJson(providersFile());
        const provider = (
            providers.providers as Record<string, unknown>[]
        ).find((p) => p.id === "pollinations") as Record<string, unknown>;
        expect(provider).toMatchObject({
            baseUrl: "https://gen.pollinations.ai/v1",
            adapter: "openai-chat",
            credentialRef: "cred_pollinations_codex",
            enabled: true,
        });

        const store = readJson(credentialStoreFile());
        const credential = (
            store.credentials as Record<string, unknown>[]
        ).find((c) => c.id === "cred_pollinations_codex") as Record<
            string,
            unknown
        >;
        expect(credential).toMatchObject({
            providerId: "pollinations",
            providerType: "generic",
            kind: "api_key",
            state: "active",
            secretRef: {
                type: "provider-file",
                providerId: "pollinations",
                target: "codex",
            },
        });

        expect(read(secretFile()).trim()).toBe("sk_test_key");
        expect(read(tomlFile())).toContain("codex-router-managed");
        expect(callsLog()).toEqual([
            "control client-setup codex",
            "discover-models pollinations",
            "control model-set pollinations/openai/gpt-5.4-nano",
        ]);
        expect(codex.status(ctx)).toMatchObject({ configured: true });
    });

    it("only bootstraps the router once", () => {
        installFakeTools();
        configureCodex(ctx, settings);
        configureCodex(ctx, { ...settings, model: "openai/gpt-5.4-mini" });
        expect(
            callsLog().filter((line) =>
                line.startsWith("control client-setup"),
            ),
        ).toHaveLength(1);
    });

    it("keeps other generic providers and credentials untouched", () => {
        installFakeTools();
        mkdirSync(stateDir(), { recursive: true });
        writeFileSync(
            providersFile(),
            JSON.stringify({
                version: 1,
                providers: [{ id: "openrouter", displayName: "OpenRouter" }],
            }),
        );
        writeFileSync(
            credentialStoreFile(),
            JSON.stringify({
                schemaVersion: 2,
                credentials: [
                    { id: "cred_openrouter_x", providerId: "openrouter" },
                ],
            }),
        );

        configureCodex(ctx, settings);

        const providers = readJson(providersFile()).providers as Record<
            string,
            unknown
        >[];
        expect(providers.map((p) => p.id).sort()).toEqual([
            "openrouter",
            "pollinations",
        ]);
        const credentials = readJson(credentialStoreFile())
            .credentials as Record<string, unknown>[];
        expect(credentials.map((c) => c.id).sort()).toEqual([
            "cred_openrouter_x",
            "cred_pollinations_codex",
        ]);
    });

    it("restores the original files byte-for-byte on off", async () => {
        installFakeTools();
        mkdirSync(stateDir(), { recursive: true });
        const original = JSON.stringify({ version: 1, providers: [] });
        writeFileSync(providersFile(), original);

        configureCodex(ctx, settings);
        const result = disableCodex(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(providersFile())).toBe(original);
        expect(existsSync(credentialStoreFile())).toBe(false);
        expect(existsSync(secretFile())).toBe(false);
        expect((await codex.status(ctx)).configured).toBe(false);
        // Router-wide TOML wiring is never touched by `off`.
        expect(read(tomlFile())).toContain("codex-router-managed");
    });

    it("strips only the Pollinations entries when config changed since on", () => {
        installFakeTools();
        configureCodex(ctx, settings);

        const providers = readJson(providersFile());
        (providers.providers as Record<string, unknown>[]).push({
            id: "openrouter",
            displayName: "OpenRouter",
        });
        writeFileSync(providersFile(), JSON.stringify(providers));

        const result = disableCodex(ctx);
        expect(result.outcome).toBe("stripped");

        const remaining = readJson(providersFile()).providers as Record<
            string,
            unknown
        >[];
        expect(remaining.map((p) => p.id)).toEqual(["openrouter"]);
        expect(
            (readJson(credentialStoreFile()).credentials as unknown[]).length,
        ).toBe(0);
    });

    it("reports unchanged when off runs before on", () => {
        installFakeTools();
        expect(disableCodex(ctx).outcome).toBe("unchanged");
    });

    it("honors CODEX_HOME and CODEX_ROUTER_STATE_DIR", () => {
        expect(codexHome({ home, env: { CODEX_HOME: "~/custom-codex" } })).toBe(
            join(home, "custom-codex"),
        );
        expect(
            codexRouterStateDir({
                home,
                env: { CODEX_ROUTER_STATE_DIR: "/tmp/x" },
            }),
        ).toBe("/tmp/x");
    });

    it("reports unconfigured when the secret file is missing", async () => {
        installFakeTools();
        configureCodex(ctx, settings);
        rmSync(secretFile());
        expect((await codex.status(ctx)).configured).toBe(false);
    });

    it("re-running on switches the model and keeps the same credential id", () => {
        installFakeTools();
        configureCodex(ctx, settings);
        configureCodex(ctx, { ...settings, model: "openai/gpt-5.4-mini" });

        const credentials = readJson(credentialStoreFile())
            .credentials as Record<string, unknown>[];
        expect(credentials).toHaveLength(1);
        expect(callsLog().at(-1)).toBe(
            "control model-set pollinations/openai/gpt-5.4-mini",
        );
    });

    it("surfaces a failure from codex-router instead of reporting success", () => {
        const binDir = join(home, "bin");
        mkdirSync(binDir, { recursive: true });
        writeFileSync(join(binDir, "codex"), "#!/bin/sh\nexit 0\n");
        chmodSync(join(binDir, "codex"), 0o755);
        writeFileSync(join(binDir, "codex-router"), "#!/bin/sh\nexit 1\n");
        chmodSync(join(binDir, "codex-router"), 0o755);
        ctx.env = {
            ...process.env,
            HOME: home,
            PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
        };
        expect(() => configureCodex(ctx, settings)).toThrow();
    });

    it("stops before configuration when codex-router is unavailable", async () => {
        const binDir = join(home, "bin");
        mkdirSync(binDir, { recursive: true });
        writeFileSync(join(binDir, "codex"), "#!/bin/sh\nexit 0\n");
        chmodSync(join(binDir, "codex"), 0o755);
        ctx.env = {
            ...process.env,
            HOME: home,
            PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
        };
        await expect(codex.on(ctx, {})).rejects.toThrow(
            "Codex Router was not found",
        );
        expect(existsSync(stateDir())).toBe(false);
    });

    it("stops before configuration when Codex is unavailable", async () => {
        await expect(codex.on(ctx, {})).rejects.toThrow("Codex was not found");
        expect(existsSync(stateDir())).toBe(false);
    });
});

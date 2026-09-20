import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CODEX_ROUTER_PIN, codex, codexDeps } from "./codex.js";
import type { HarnessContext } from "./types.js";

const MODELS = [
    { id: "openai/gpt-5.4-nano", contextWindow: 400_000, input: ["text"] },
    { id: "openai/gpt-5.5", contextWindow: 1_000_000, input: ["text"] },
];

let home: string;
let ctx: HarnessContext;
let revokeSpy: ReturnType<typeof vi.fn>;

const stateDir = () => join(home, "router-state");
const credentialFile = () =>
    join(stateDir(), "generic-provider-credentials", "pollinations.key");
const routerDir = () =>
    join(home, ".pollinations", "harnesses", "codex", "codex-router");
const manifestPath = () =>
    join(home, ".pollinations", "harnesses", "codex", "manifest.json");
const txPath = () =>
    join(home, ".pollinations", "harnesses", "codex", "tx.json");
const fakeStateFile = () => join(stateDir(), "fake-providers.json");
const fakeLogFile = () => join(stateDir(), "fake-router.log");

const readFakeState = () =>
    JSON.parse(readFileSync(fakeStateFile(), "utf-8")) as {
        provider: null | {
            id: string;
            description?: string;
            enabled?: boolean;
            models?: string[];
        };
    };
const readLog = (): string[][] =>
    (readTextSafe(fakeLogFile()) ?? "")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]);
const readTextSafe = (path: string) =>
    existsSync(path) ? readFileSync(path, "utf-8") : null;

/** Minimal stand-in for the router's src/*.mjs command surface. */
const FAKE_PROVIDERS = `
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
const stateDir = process.env.MODEL_ROUTER_STATE_DIR;
const stateFile = join(stateDir, "fake-providers.json");
const log = (args) => appendFileSync(join(stateDir, "fake-router.log"), JSON.stringify(args) + "\\n");
const load = () => existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf-8")) : { provider: null };
const save = (state) => { mkdirSync(dirname(stateFile), { recursive: true }); writeFileSync(stateFile, JSON.stringify(state)); };
const args = process.argv.slice(2);
log(["providers", ...args]);
const json = args.includes("--json");
const out = (value) => { process.stdout.write(JSON.stringify(value) + "\\n"); };
if (args[0] !== "generic") process.exit(2);
const action = args[1];
const state = load();
if (action === "show") {
  if (!state.provider) process.exit(1);
  out({ provider: state.provider });
} else if (action === "add") {
  const id = args[2];
  const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
  state.provider = { id, displayName: flag("--name"), baseUrl: flag("--base-url"), adapter: flag("--adapter"), credentialRef: flag("--credential-ref"), description: flag("--description"), enabled: false, models: [] };
  save(state); out({ provider: state.provider });
} else if (action === "enable" || action === "disable") {
  if (!state.provider) process.exit(1);
  state.provider.enabled = action === "enable";
  save(state); out({ provider: state.provider });
} else if (action === "remove") {
  if (!state.provider) process.exit(1);
  state.provider = null; save(state); out({ removed: "pollinations" });
} else if (action === "credential") {
  if (args[3] !== "status") process.exit(2);
  const key = join(stateDir, "generic-provider-credentials", "pollinations.key");
  out({ providerId: "pollinations", credentialRef: "cred_pollinations", configured: existsSync(key) });
} else process.exit(2);
`;

const FAKE_CURATE = `
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
const stateDir = process.env.MODEL_ROUTER_STATE_DIR;
const stateFile = join(stateDir, "fake-providers.json");
const args = process.argv.slice(2);
appendFileSync(join(stateDir, "fake-router.log"), JSON.stringify(["curate-models", ...args]) + "\\n");
const state = JSON.parse(readFileSync(stateFile, "utf-8"));
if (!state.provider) process.exit(1);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
if (flag("--models")) state.provider.models = flag("--models").split(",");
if (flag("--remove")) {
  const removals = flag("--remove").split(",");
  state.provider.models = (state.provider.models || []).filter((m) => !removals.includes(m));
}
writeFileSync(stateFile, JSON.stringify(state));
process.stdout.write("Saved.\\n");
`;

const FAKE_DOCTOR = `process.stdout.write("all checks passed\\n");\n`;
const FAKE_SMOKE = `process.stdout.write("{\\"ok\\":true}\\n");\n`;

const writeFakeRouter = () => {
    const src = join(routerDir(), "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(
        join(routerDir(), "package.json"),
        JSON.stringify({ version: "0.6.0" }),
    );
    writeFileSync(join(src, "providers.mjs"), FAKE_PROVIDERS);
    writeFileSync(join(src, "curate-models.mjs"), FAKE_CURATE);
    writeFileSync(join(src, "doctor.mjs"), FAKE_DOCTOR);
    writeFileSync(join(src, "smoke-test.mjs"), FAKE_SMOKE);
};

const installFakeCodexCli = () => {
    const binDir = join(home, "bin");
    mkdirSync(binDir, { recursive: true });
    const binary = join(binDir, "codex");
    writeFileSync(
        binary,
        '#!/usr/bin/env node\nif (process.argv[2] === "--version") { console.log("codex-cli 0.55.0"); process.exit(0); }\nprocess.exit(1);\n',
    );
    chmodSync(binary, 0o755);
    return binDir;
};

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-codex-"));
    mkdirSync(stateDir(), { recursive: true });
    const binDir = installFakeCodexCli();
    ctx = {
        home,
        env: {
            ...process.env,
            HOME: home,
            MODEL_ROUTER_STATE_DIR: stateDir(),
            PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
        },
    };
    revokeSpy = vi.fn().mockResolvedValue(1);
    codexDeps.fetchModels = vi.fn().mockResolvedValue(MODELS);
    codexDeps.resolveKey = vi.fn().mockResolvedValue("sk_child_key");
    codexDeps.revokeKeys = revokeSpy;
    codexDeps.validateKey = vi.fn().mockResolvedValue(true);
    codexDeps.gitHead = () => CODEX_ROUTER_PIN;
});

afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    vi.restoreAllMocks();
});

describe("codex harness on", () => {
    it("creates the provider, publishes the key, curates models, writes a baseline", async () => {
        writeFakeRouter();
        const result = await codex.on(ctx, {});

        expect(result.configured).toBe(true);
        expect(result.model).toBe("openai/gpt-5.4-nano");
        expect(result.state).toBe("configured");

        const state = readFakeState();
        expect(state.provider).toMatchObject({
            id: "pollinations",
            baseUrl: "https://gen.pollinations.ai/v1",
            adapter: "openai-chat",
            credentialRef: "cred_pollinations",
            enabled: true,
            models: ["openai/gpt-5.4-nano", "openai/gpt-5.5"],
        });
        expect(state.provider?.description).toContain(
            "managed-by: polli-cli harness codex",
        );

        expect(readFileSync(credentialFile(), "utf-8")).toBe("sk_child_key\n");
        expect(statSync(credentialFile()).mode & 0o777).toBe(0o600);

        const baseline = JSON.parse(readFileSync(manifestPath(), "utf-8"));
        expect(baseline).toMatchObject({
            created_by_us: true,
            enabled_at_first_on: false,
            models_added_by_us: ["openai/gpt-5.4-nano", "openai/gpt-5.5"],
        });
        expect(existsSync(txPath())).toBe(false);
    });

    it("refuses to touch a foreign provider with the same id", async () => {
        writeFakeRouter();
        writeFileSync(
            fakeStateFile(),
            JSON.stringify({
                provider: {
                    id: "pollinations",
                    description: "mine",
                    enabled: true,
                    models: [],
                },
            }),
        );
        await expect(codex.on(ctx, {})).rejects.toMatchObject({
            exitCode: 2,
        });
        // Nothing was mutated: no key file, no baseline.
        expect(existsSync(credentialFile())).toBe(false);
        expect(existsSync(manifestPath())).toBe(false);
    });

    it("recovers an interrupted on before re-applying", async () => {
        writeFakeRouter();
        // Simulate a crash after `add` but before key publication.
        writeFileSync(
            fakeStateFile(),
            JSON.stringify({
                provider: {
                    id: "pollinations",
                    description: "managed-by: polli-cli harness codex",
                    enabled: false,
                    models: [],
                },
            }),
        );
        mkdirSync(join(home, ".pollinations", "harnesses", "codex"), {
            recursive: true,
        });
        writeFileSync(
            txPath(),
            JSON.stringify({
                step: "minted",
                pre: { exists: false, owned: false, enabled: false },
                models_delta: [],
                started_at: "2026-09-21T00:00:00.000Z",
            }),
        );

        const result = await codex.on(ctx, {});
        expect(result.configured).toBe(true);
        const log = readLog();
        // Reconcile removed the half-created provider before re-adding it.
        expect(log[0]).toEqual([
            "providers",
            "generic",
            "show",
            "pollinations",
            "--json",
        ]);
        expect(log.some((args) => args.includes("remove"))).toBe(true);
        expect(log.some((args) => args.includes("add"))).toBe(true);
        expect(existsSync(txPath())).toBe(false);
    });

    it("runs the router smoke test only with --smoke", async () => {
        writeFakeRouter();
        const smoke = vi.fn();
        codexDeps.smokeTest = smoke;
        await codex.on(ctx, {});
        expect(smoke).not.toHaveBeenCalled();
        await codex.on(ctx, { smoke: true });
        expect(smoke).toHaveBeenCalledWith(ctx, "openai/gpt-5.4-nano");
    });
});

describe("codex harness off", () => {
    const setup = async () => {
        writeFakeRouter();
        await codex.on(ctx, {});
    };

    it("strips every owned artifact, revokes the key, keeps foreign state", async () => {
        await setup();
        const result = await codex.off(ctx);

        expect(["restored", "stripped"]).toContain(result.outcome);
        expect(result.exitCode ?? 0).toBe(0);
        expect(existsSync(credentialFile())).toBe(false);
        expect(existsSync(manifestPath())).toBe(false);
        expect(readFakeState().provider).toBeNull();
        expect(revokeSpy).toHaveBeenCalledWith("codex");
    });

    it("disables instead of removing a provider that existed before us", async () => {
        writeFakeRouter();
        // Foreign-owned by marker? No: provider created earlier by US, but the
        // baseline says it existed before first on (recreated scenario).
        writeFileSync(
            fakeStateFile(),
            JSON.stringify({
                provider: {
                    id: "pollinations",
                    description: "managed-by: polli-cli harness codex",
                    enabled: true,
                    models: ["openai/gpt-5.4-nano"],
                },
            }),
        );
        mkdirSync(join(home, ".pollinations", "harnesses", "codex"), {
            recursive: true,
        });
        writeFileSync(
            manifestPath(),
            JSON.stringify({
                created_by_us: false,
                enabled_at_first_on: true,
                models_added_by_us: ["openai/gpt-5.4-nano"],
                first_on_at: "2026-09-21T00:00:00.000Z",
            }),
        );
        mkdirSync(join(stateDir(), "generic-provider-credentials"), {
            recursive: true,
        });
        writeFileSync(credentialFile(), "sk_child_key\n");

        const result = await codex.off(ctx);
        expect(result.exitCode ?? 0).toBe(0);
        const provider = readFakeState().provider;
        // Provider kept (not removed) and NOT disabled: it was enabled before us.
        expect(provider).not.toBeNull();
        expect(provider?.enabled).toBe(true);
        expect(provider?.models).toEqual([]);
        expect(existsSync(credentialFile())).toBe(false);
    });

    it("reports unchanged when nothing was ever configured", async () => {
        writeFakeRouter();
        const result = await codex.off(ctx);
        expect(result.outcome).toBe("unchanged");
        expect(result.exitCode).toBe(4);
        expect(revokeSpy).not.toHaveBeenCalled();
    });
});

describe("codex harness status", () => {
    it("reports router-missing without a router", async () => {
        const result = await codex.status(ctx);
        expect(result.state).toBe("router-missing");
        expect(result.exitCode).toBe(2);
    });

    it("reports version-unsupported for a wrong pin", async () => {
        writeFakeRouter();
        codexDeps.gitHead = () => "0".repeat(40);
        const result = await codex.status(ctx);
        expect(result.state).toBe("version-unsupported");
        expect(result.exitCode).toBe(2);
    });

    it("reports not-configured without a provider", async () => {
        writeFakeRouter();
        const result = await codex.status(ctx);
        expect(result.state).toBe("not-configured");
        expect(result.exitCode).toBe(4);
    });

    it("reports key-valid once everything is wired", async () => {
        writeFakeRouter();
        await codex.on(ctx, {});
        const result = await codex.status(ctx);
        expect(result.state).toBe("key-valid");
        expect(result.exitCode).toBe(0);
        expect(result.configured).toBe(true);
    });

    it("reports key-invalid when the stored key stopped validating", async () => {
        writeFakeRouter();
        await codex.on(ctx, {});
        codexDeps.validateKey = vi.fn().mockResolvedValue(false);
        const result = await codex.status(ctx);
        expect(result.state).toBe("key-invalid");
        expect(result.configured).toBe(false);
    });
});

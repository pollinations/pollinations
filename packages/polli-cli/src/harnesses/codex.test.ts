import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HarnessContext } from "./types.js";

const mocks = vi.hoisted(() => ({
    resolveHarnessKey: vi.fn(
        async (harness: { existingKey: string | null }) =>
            harness.existingKey ?? "sk_new",
    ),
    fetchHarnessModels: vi.fn(async (selected: string) => [
        { id: selected, contextWindow: 128000, input: ["text"] },
    ]),
    keyUsageCount: vi.fn(async () => 0),
    waitForKeyUsageIncrease: vi.fn(async () => 1),
}));

vi.mock("./keys.js", () => ({
    resolveHarnessKey: mocks.resolveHarnessKey,
}));
vi.mock("./models.js", () => ({
    fetchHarnessModels: mocks.fetchHarnessModels,
}));
vi.mock("./usage-proof.js", () => ({
    keyUsageCount: mocks.keyUsageCount,
    waitForKeyUsageIncrease: mocks.waitForKeyUsageIncrease,
}));

import {
    codex,
    codexRouterVersionCompatible,
    configureCodex,
} from "./codex.js";

const STATE = `
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
const stateFile = process.env.TEST_ROUTER_STATE;
const keyFile = join(process.env.CODEX_HOME, "codex-router", "generic-provider-credentials", "pollinations.key");
const modelsFile = join(process.env.CODEX_HOME, "codex-router", "user-models.json");
export const load = () => existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, "utf8"))
  : { provider: null, key: null, models: [] };
export const save = (state) => {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state));
  mkdirSync(dirname(modelsFile), { recursive: true });
  writeFileSync(modelsFile, JSON.stringify({
    models: state.models.map((slug) => ({ provider: "pollinations", slug })),
  }));
  if (state.key) {
    mkdirSync(dirname(keyFile), { recursive: true });
    writeFileSync(keyFile, state.key + "\\n");
  } else if (existsSync(keyFile)) {
    rmSync(keyFile);
  }
};
`;

const PROVIDERS = `
import { load, save } from "./state.mjs";
export async function runGenericCommand(args, deps = {}) {
  const state = load();
  const action = args[0];
  if (action === "credential") {
    const sub = args[2] || "status";
    if (sub === "status") {
      console.log(JSON.stringify({ configured: Boolean(state.key) }));
      return;
    }
    if (sub === "set") {
      let input = "";
      for await (const chunk of process.stdin) input += chunk;
      state.key = deps.prompt ? deps.prompt("key") : input.trim();
      save(state);
      console.log(JSON.stringify({ configured: Boolean(state.key) }));
      return;
    }
  }
  const id = args[1];
  if (action === "show") {
    if (!state.provider) {
      console.error("Unknown generic provider");
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ provider: state.provider }));
    return;
  }
  if (action === "add") {
    const value = (name) => args[args.indexOf(name) + 1];
    state.provider = {
      id,
      displayName: value("--name"),
      baseUrl: value("--base-url"),
      adapter: value("--adapter"),
      description: value("--description"),
      enabled: true,
    };
    save(state);
    console.log(JSON.stringify({ provider: state.provider }));
    return;
  }
  if (action === "remove") {
    state.provider = null;
    state.key = null;
    state.models = [];
    save(state);
    console.log(JSON.stringify({ removed: id }));
  }
}
if (process.argv[1]?.endsWith("providers.mjs")) {
  await runGenericCommand(process.argv.slice(3));
}
`;

const CURATE = `
import { load, save } from "./state.mjs";
const state = load();
const args = process.argv.slice(2);
if (args.includes("--remove")) {
  const model = args[args.indexOf("--remove") + 1];
  state.models = state.models.filter((item) => item !== model);
} else {
  const model = args[args.indexOf("--models") + 1];
  if (!state.models.includes(model)) state.models.push(model);
}
save(state);
`;

const SMOKE = `
if (process.env.TEST_SMOKE_FAIL === "1") {
  console.error("forced smoke failure");
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  results: [{ name: "basic response", ok: true, detail: "pong" }]
}));
`;

let home: string;
let router: string;
let bin: string;
let ctx: HarnessContext;

const executable = (name: string) => {
    const file = join(bin, process.platform === "win32" ? `${name}.cmd` : name);
    writeFileSync(
        file,
        process.platform === "win32" ? "@echo off\r\n" : "#!/bin/sh\n",
    );
    chmodSync(file, 0o755);
    return file;
};

const readState = () =>
    JSON.parse(readFileSync(join(home, "router-state.json"), "utf8")) as {
        provider: { description?: string; baseUrl?: string } | null;
        key: string | null;
        models: string[];
    };

beforeEach(() => {
    mocks.resolveHarnessKey.mockClear();
    mocks.fetchHarnessModels.mockClear();
    mocks.keyUsageCount.mockClear();
    mocks.waitForKeyUsageIncrease.mockClear();

    home = mkdtempSync(join(tmpdir(), "polli-codex-harness-"));
    router = join(home, "router");
    bin = join(home, "bin");
    mkdirSync(join(router, "src"), { recursive: true });
    mkdirSync(bin, { recursive: true });
    writeFileSync(
        join(router, "package.json"),
        JSON.stringify({ name: "codex-model-router", version: "0.6.0" }),
    );
    writeFileSync(join(router, "src", "state.mjs"), STATE);
    writeFileSync(join(router, "src", "providers.mjs"), PROVIDERS);
    writeFileSync(join(router, "src", "curate-models.mjs"), CURATE);
    writeFileSync(join(router, "src", "compatibility-test.mjs"), SMOKE);
    executable("codex");

    ctx = {
        home,
        env: {
            PATH: [bin, process.env.PATH ?? ""].join(delimiter),
            PATHEXT: process.env.PATHEXT,
            CODEX_ROUTER_SOURCE_ROOT: router,
            CODEX_HOME: join(home, ".codex"),
            TEST_ROUTER_STATE: join(home, "router-state.json"),
        },
    };
});

afterEach(() => {
    rmSync(home, { recursive: true, force: true });
});

describe("Codex harness", () => {
    it("checks the supported Codex Router version", () => {
        expect(codexRouterVersionCompatible("0.6.0")).toBe(true);
        expect(codexRouterVersionCompatible("0.6.9")).toBe(true);
        expect(codexRouterVersionCompatible("1.0.0")).toBe(true);
        expect(codexRouterVersionCompatible("0.5.9")).toBe(false);
        expect(codexRouterVersionCompatible("garbage")).toBe(false);
    });

    it("stops before login or key creation when Codex Router is missing", async () => {
        const missing = {
            ...ctx,
            env: {
                ...ctx.env,
                CODEX_ROUTER_SOURCE_ROOT: join(home, "missing"),
            },
        };
        await expect(codex.on(missing, {})).rejects.toThrow(
            "Codex Router was not found",
        );
        expect(mocks.resolveHarnessKey).not.toHaveBeenCalled();
    });

    it("stops before login or key creation when Codex is missing", async () => {
        const missing = { ...ctx, env: { ...ctx.env, PATH: "" } };
        await expect(codex.on(missing, {})).rejects.toThrow(
            "Codex was not found",
        );
        expect(mocks.resolveHarnessKey).not.toHaveBeenCalled();
    });

    it("configures an owned provider, protected child key, live-selected model, and verified smoke", async () => {
        const result = await codex.on(ctx, {
            model: "z-ai/glm-5.3-flash",
        });
        expect(result).toMatchObject({
            configured: true,
            model: "pollinations/z-ai/glm-5.3-flash",
            smokeVerified: true,
            providerReady: true,
            keyReady: true,
        });
        expect(readState()).toMatchObject({
            provider: {
                description: "managed-by=polli-harness-codex",
                baseUrl: "https://gen.pollinations.ai/v1",
            },
            key: "sk_new",
            models: ["z-ai/glm-5.3-flash"],
        });
        expect(mocks.fetchHarnessModels).toHaveBeenCalledWith(
            "z-ai/glm-5.3-flash",
        );
        expect(mocks.waitForKeyUsageIncrease).toHaveBeenCalledWith(
            "sk_new",
            0,
            expect.objectContaining({ afterMs: expect.any(Number) }),
        );
    });

    it("reuses the child key already stored by Codex Router", async () => {
        await codex.on(ctx, { model: "openai/gpt-5.4-nano" });
        mocks.resolveHarnessKey.mockClear();
        await codex.on(ctx, { model: "openai/gpt-5.4-mini" });
        expect(mocks.resolveHarnessKey).toHaveBeenCalledWith(
            expect.objectContaining({ existingKey: "sk_new" }),
            expect.anything(),
        );
        expect(readState().models).toEqual([
            "openai/gpt-5.4-nano",
            "openai/gpt-5.4-mini",
        ]);
    });

    it("refuses a foreign provider collision without requesting a key", async () => {
        writeFileSync(
            join(home, "router-state.json"),
            JSON.stringify({
                provider: {
                    id: "pollinations",
                    displayName: "Other",
                    baseUrl: "https://example.invalid/v1",
                    adapter: "openai-chat",
                    description: "someone-else",
                    enabled: true,
                },
                key: "foreign",
                models: [],
            }),
        );
        await expect(
            configureCodex(ctx, "openai/gpt-5.4-nano"),
        ).rejects.toThrow("Polli does not own");
        expect(mocks.resolveHarnessKey).not.toHaveBeenCalled();
    });

    it("rolls a fresh provider back when the routed smoke fails", async () => {
        const failed = {
            ...ctx,
            env: { ...ctx.env, TEST_SMOKE_FAIL: "1" },
        };
        await expect(
            codex.on(failed, { model: "openai/gpt-5.4-nano" }),
        ).rejects.toThrow("smoke test");
        expect(readState()).toMatchObject({
            provider: null,
            key: null,
            models: [],
        });
    });

    it("off removes only the Polli-owned provider and its routes", async () => {
        await codex.on(ctx, { model: "openai/gpt-5.4-nano" });
        const result = await codex.off(ctx);
        expect(result.outcome).toBe("stripped");
        expect(result.configured).toBe(false);
        expect(readState()).toMatchObject({
            provider: null,
            key: null,
            models: [],
        });
    });
});

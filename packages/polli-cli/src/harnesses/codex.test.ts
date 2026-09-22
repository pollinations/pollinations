import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codex, configureCodex, disableCodex } from "./codex.js";
import type { HarnessContext } from "./types.js";

// A stand-in for the Codex Router checkout: the same script names and CLI
// contract the adapter drives (`providers generic …`, `curate-models`,
// `compatibility-test`). State lives only in the files the adapter snapshots
// (generic-providers / credentials / user-models), so rollback and
// byte-for-byte restore exercise the real snapshot path end-to-end.
const readJson = (file: string) => {
    try {
        return JSON.parse(readFileSync(file, "utf8")) as Record<
            string,
            unknown
        >;
    } catch {
        return null;
    }
};
let home = "";
const stateDir = () => join(home, ".codex", "codex-router");
const providersFile = () => join(stateDir(), "generic-providers.json");
const modelsFile = () => join(stateDir(), "user-models.json");
const keyFile = () =>
    join(stateDir(), "generic-provider-credentials", "pollinations.key");
const loadProviders = () =>
    (readJson(providersFile()) as { providers: { id: string }[] } | null) ?? {
        providers: [],
    };
const loadModels = () =>
    (readJson(modelsFile()) as { models: { slug: string }[] } | null) ?? {
        models: [],
    };
const loadKey = (): string | null => {
    try {
        return readFileSync(keyFile(), "utf8").trim();
    } catch {
        return null;
    }
};

const state = () => ({
    provider:
        loadProviders().providers.find((p) => p.id === "pollinations") ?? null,
    key: loadKey(),
    models: loadModels().models.map((m) => m.slug),
    providers: loadProviders().providers,
});

const PROVIDERS = `
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
const stateDir = () => join(process.env.CODEX_HOME, "codex-router");
const providersFile = () => join(stateDir(), "generic-providers.json");
const credentialsFile = () => join(stateDir(), "provider-credentials.json");
const modelsFile = () => join(stateDir(), "user-models.json");
const keyFile = () => join(stateDir(), "generic-provider-credentials", "pollinations.key");
const readJson = (file) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } };
const write = (file, value) => { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); };
const loadProviders = () => readJson(providersFile()) ?? { providers: [] };
const loadModels = () => readJson(modelsFile()) ?? { models: [] };
const loadKey = () => { try { return readFileSync(keyFile(), "utf8").trim(); } catch { return null; } };

export async function runGenericCommand(args, deps = {}) {
  const [action, id] = args;
  if (action === "credential") {
    if (args[2] === "set") {
      const key = deps.stdin !== undefined ? deps.stdin : deps.prompt("key");
      write(keyFile(), String(key).trim());
      write(credentialsFile(), { credentials: [{ providerId: id, state: "active" }] });
      console.log(JSON.stringify({ providerId: id, configured: true }));
    } else {
      console.log(JSON.stringify({ configured: loadKey() !== null }));
    }
    return;
  }
  if (action === "show") {
    const provider = loadProviders().providers.find((p) => p.id === id);
    if (!provider) { console.error("Unknown generic provider"); process.exit(1); }
    console.log(JSON.stringify({ provider }));
  } else if (action === "add" || action === "edit") {
    const baseIndex = args.indexOf("--base-url");
    const providers = loadProviders().providers.filter((p) => p.id !== id);
    providers.push({ id, baseUrl: args[baseIndex + 1] });
    write(providersFile(), { providers });
    console.log(JSON.stringify({ provider: { id, baseUrl: args[baseIndex + 1] } }));
  } else if (action === "remove") {
    write(providersFile(), { providers: loadProviders().providers.filter((p) => p.id !== id) });
    write(modelsFile(), { models: loadModels().models.filter((m) => m.provider !== id) });
    try { rmSync(keyFile(), { force: true }); } catch {}
    write(credentialsFile(), { credentials: [] });
    console.log(JSON.stringify({ removed: id }));
  }
}
const stdinChunks = [];
for await (const chunk of process.stdin) stdinChunks.push(chunk);
const stdin = Buffer.concat(stdinChunks).toString("utf8");
await runGenericCommand(process.argv.slice(3), { stdin });
`;
const CURATE = `
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const stateDir = () => join(process.env.CODEX_HOME, "codex-router");
const modelsFile = () => join(stateDir(), "user-models.json");
const readJson = (file) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } };
const write = (file, value) => { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); };
const models = readJson(modelsFile())?.models ?? [];
const a = process.argv.slice(2);
if (a.includes("--remove")) {
  const slug = "pollinations/" + a[a.indexOf("--remove") + 1];
  write(modelsFile(), { models: models.filter((m) => m.slug !== slug) });
} else {
  const ids = a[a.indexOf("--models") + 1].split(",");
  for (const id of ids) {
    const slug = "pollinations/" + id;
    if (!models.some((m) => m.slug === slug)) models.push({ provider: "pollinations", slug });
  }
  write(modelsFile(), { models });
}
`;
const SMOKE = `
import { readFileSync } from "node:fs";
import { join } from "node:path";
if (process.env.SMOKE_FAIL) { console.error("upstream 400"); process.exit(1); }
const keyFile = join(process.env.CODEX_HOME, "codex-router", "generic-provider-credentials", "pollinations.key");
let key = null;
try { key = readFileSync(keyFile, "utf8").trim(); } catch {}
if (!key) { console.error("no credential"); process.exit(1); }
const model = process.argv.slice(2).find((v) => !v.startsWith("--"));
console.log(JSON.stringify({ model, ok: true }));
`;

let router: string;
let ctx: HarnessContext;

const executable = (dir: string, name: string) => {
    const file = join(dir, process.platform === "win32" ? `${name}.cmd` : name);
    writeFileSync(file, "");
    chmodSync(file, 0o755);
};

const writeRouterVersion = (version: string) =>
    writeFileSync(
        join(router, "package.json"),
        JSON.stringify({ name: "codex-model-router", version }),
    );

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-codex-"));
    router = join(home, "router");
    mkdirSync(join(router, "src"), { recursive: true });
    writeRouterVersion("0.6.0");
    for (const [name, body] of Object.entries({
        "providers.mjs": PROVIDERS,
        "curate-models.mjs": CURATE,
        "compatibility-test.mjs": SMOKE,
    })) {
        writeFileSync(join(router, "src", name), body);
    }
    const bin = join(home, "bin");
    mkdirSync(bin);
    executable(bin, "codex");
    ctx = {
        home,
        env: {
            PATH: bin,
            CODEX_ROUTER_HOME: router,
            CODEX_HOME: join(home, ".codex"),
        },
    };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("codex adapter", () => {
    it("stops with install guidance when the router or Codex is missing", async () => {
        await expect(
            codex.on(
                {
                    ...ctx,
                    env: { ...ctx.env, CODEX_ROUTER_HOME: join(home, "nope") },
                },
                {},
            ),
        ).rejects.toThrow("Codex Router was not found");
        await expect(
            codex.on({ ...ctx, env: { ...ctx.env, PATH: "" } }, {}),
        ).rejects.toThrow("Codex was not found");
        const status = await codex.status({
            ...ctx,
            env: { ...ctx.env, CODEX_ROUTER_HOME: join(home, "nope") },
        });
        expect(status.details).toMatchObject({
            router: false,
            next: expect.stringContaining("Install Codex Router"),
        });
    });

    it("rejects a router older than the credential --stdin contract", async () => {
        writeRouterVersion("0.4.0");
        await expect(
            codex.on(
                { ...ctx, env: { ...ctx.env, PATH: ctx.env.PATH ?? "" } },
                {},
            ),
        ).rejects.toThrow("too old");
        const status = await codex.status(ctx);
        expect(status.details?.next).toContain("Upgrade Codex Router");
    });

    it("status reports each prerequisite before anything is configured", async () => {
        expect(await codex.status(ctx)).toMatchObject({
            configured: false,
            details: {
                router: true,
                client: true,
                provider: false,
                key: false,
                version: "0.6.0",
            },
        });
    });

    it("off is a no-op when nothing is connected", async () => {
        expect(await disableCodex(ctx)).toMatchObject({
            outcome: "unchanged",
        });
        expect(existsSync(join(home, ".codex", "codex-router"))).toBe(false);
    });

    it("adds the provider, hands the key over stdin, and curates the chosen model", async () => {
        await configureCodex(
            ctx,
            "z-ai/glm-5.3-flash",
            async () => "sk_dedicated",
        );
        expect(state()).toMatchObject({
            provider: {
                id: "pollinations",
                baseUrl: "https://gen.pollinations.ai/v1",
            },
            key: "sk_dedicated",
            models: ["pollinations/z-ai/glm-5.3-flash"],
        });
        expect(await codex.status(ctx)).toMatchObject({
            configured: true,
            model: "z-ai/glm-5.3-flash",
        });
    });

    it("reuses the key already in the router and adds further models", async () => {
        await configureCodex(ctx, "a/one", async () => "sk_first");
        await configureCodex(ctx, "b/two", async () => {
            throw new Error("must not ask for another key");
        });
        expect(state().key).toBe("sk_first");
        expect(state().models).toEqual([
            "pollinations/a/one",
            "pollinations/b/two",
        ]);
    });

    it("undoes a fresh install when the smoke test fails", async () => {
        await expect(
            configureCodex(
                { ...ctx, env: { ...ctx.env, SMOKE_FAIL: "1" } },
                "a/one",
                async () => "sk_dedicated",
            ),
        ).rejects.toThrow("Smoke test through Codex Router failed");
        expect(state()).toMatchObject({
            provider: null,
            key: null,
            models: [],
        });
        const harnessDir = join(home, ".pollinations", "harnesses");
        const leftovers = existsSync(harnessDir)
            ? readdirSync(harnessDir).filter((f) => f.startsWith("codex."))
            : [];
        expect(leftovers).toEqual([]);
    });

    it("keeps an existing setup when a later model fails its smoke test", async () => {
        await configureCodex(ctx, "a/one", async () => "sk_first");
        await expect(
            configureCodex(
                { ...ctx, env: { ...ctx.env, SMOKE_FAIL: "1" } },
                "b/two",
                async () => "x",
            ),
        ).rejects.toThrow("Smoke test");
        expect(state()).toMatchObject({
            key: "sk_first",
            models: ["pollinations/a/one"],
        });
    });

    it("off restores untouched router files byte-for-byte", async () => {
        const dir = join(home, ".codex", "codex-router");
        mkdirSync(dir, { recursive: true });
        const originalProviders = '{"providers":[]}\n';
        writeFileSync(join(dir, "generic-providers.json"), originalProviders);

        await configureCodex(ctx, "a/one", async () => "sk_dedicated");
        const result = await disableCodex(ctx);

        expect(result.outcome).toBe("restored");
        expect(readFileSync(join(dir, "generic-providers.json"), "utf-8")).toBe(
            originalProviders,
        );
        expect(existsSync(join(dir, "user-models.json"))).toBe(false);
        expect((await disableCodex(ctx)).outcome).toBe("unchanged");
    });

    it("off strips only Pollinations entries after outside edits", async () => {
        await configureCodex(ctx, "a/one", async () => "sk_dedicated");
        const dir = join(home, ".codex", "codex-router");
        const providers = JSON.parse(
            readFileSync(join(dir, "generic-providers.json"), "utf-8"),
        ) as { providers: { id: string }[] };
        providers.providers.push({ id: "openrouter" });
        writeFileSync(
            join(dir, "generic-providers.json"),
            JSON.stringify(providers),
        );

        const result = await disableCodex(ctx);
        expect(result.outcome).toBe("stripped");
        expect(state().provider).toBeNull();
        expect(state().providers.map((p) => p.id)).toEqual(["openrouter"]);
    });
});

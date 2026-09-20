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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codex, configureCodex } from "./codex.js";
import type { HarnessContext } from "./types.js";

// A stand-in for the Codex Router checkout: the same script names and CLI
// contract the adapter drives (`providers generic ...`, `curate-models`,
// `compatibility-test`), keeping state in a JSON file so the adapter's real
// subprocess calls and stdin key hand-off run unmodified.
const STATE = `
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
const file = join(process.env.CODEX_HOME, "codex-router", "state.json");
export const load = () => existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { provider: null, key: null, models: [], log: [] };
export const save = (s) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(s));
  writeFileSync(join(dirname(file), "user-models.json"), JSON.stringify({ models: s.models.map((slug) => ({ provider: "pollinations", slug })) }));
};
`;
const PROVIDERS = `
import { load, save } from "./state.mjs";
export async function runGenericCommand(args, deps = {}) {
  const s = load();
  const [action, id] = args;
  if (action === "credential") {
    if (args[2] === "set") { s.key = deps.prompt("key"); s.log.push("credential-set"); save(s); }
    else console.log(JSON.stringify({ configured: s.key !== null }));
    return;
  }
  if (action === "show") {
    if (!s.provider) { console.error("Unknown generic provider"); process.exit(1); }
    console.log(JSON.stringify({ provider: s.provider }));
  } else if (action === "add" || action === "edit") {
    s.provider = { id, baseUrl: args[args.indexOf("--base-url") + 1] };
    s.log.push(action); save(s);
  } else if (action === "remove") {
    s.provider = null; s.key = null; s.models = []; s.log.push("remove"); save(s);
  }
}
if (process.argv[1]?.endsWith("providers.mjs")) await runGenericCommand(process.argv.slice(3));
`;
const CURATE = `
import { load, save } from "./state.mjs";
const s = load(); const a = process.argv.slice(2);
if (a.includes("--remove")) s.models = s.models.filter((m) => m !== "pollinations/" + a[a.indexOf("--remove") + 1]);
else s.models.push("pollinations/" + a[a.indexOf("--models") + 1]);
s.log.push("curate"); save(s);
`;
const SMOKE = `
import { load } from "./state.mjs";
if (process.env.SMOKE_FAIL) { console.error("upstream 400"); process.exit(1); }
console.log(JSON.stringify({ ok: load().key }));
`;

let home: string;
let router: string;
let ctx: HarnessContext;

const executable = (dir: string, name: string) => {
    const file = join(dir, process.platform === "win32" ? `${name}.cmd` : name);
    writeFileSync(file, "");
    chmodSync(file, 0o755);
};
const state = () => {
    const file = join(home, ".codex", "codex-router", "state.json");
    return existsSync(file)
        ? JSON.parse(readFileSync(file, "utf-8"))
        : { log: [] };
};

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-codex-"));
    router = join(home, "router");
    mkdirSync(join(router, "src"), { recursive: true });
    writeFileSync(
        join(router, "package.json"),
        '{"name":"codex-model-router"}',
    );
    for (const [name, body] of Object.entries({
        "state.mjs": STATE,
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
        expect(
            (
                await codex.status({
                    ...ctx,
                    env: { ...ctx.env, CODEX_ROUTER_HOME: join(home, "nope") },
                })
            ).details,
        ).toMatchObject({
            router: false,
            next: expect.stringContaining("Install Codex Router"),
        });
    });

    it("status reports each prerequisite before anything is configured", async () => {
        expect(await codex.status(ctx)).toMatchObject({
            configured: false,
            details: {
                router: true,
                client: true,
                provider: false,
                key: false,
            },
        });
    });

    it("off is a no-op when nothing is connected", async () => {
        expect(await codex.off(ctx)).toMatchObject({ outcome: "unchanged" });
        expect(state().log).toEqual([]);
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
            model: "pollinations/z-ai/glm-5.3-flash",
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
        ).rejects.toThrow(
            "Smoke test through Codex Router failed: upstream 400",
        );
        expect(state()).toMatchObject({
            provider: null,
            key: null,
            models: [],
        });
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

    it("off removes the provider, its key and routes", async () => {
        await configureCodex(ctx, "a/one", async () => "sk_dedicated");
        expect(await codex.off(ctx)).toMatchObject({
            outcome: "stripped",
            configured: false,
        });
        expect(state()).toMatchObject({
            provider: null,
            key: null,
            models: [],
        });
    });
});

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import { commandExists, readTextIfExists } from "./fs.js";
import { assertKeyUsage, harnessKeyName, resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";

const ID = "codex";
const LABEL = "Codex";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const ROUTER_INSTALL =
    "https://github.com/duolahypercho/codex-router#install-everything-recommended";

const routerDir = (ctx: HarnessContext) =>
    ctx.env.CODEX_ROUTER_HOME?.trim() ||
    (process.platform === "win32"
        ? join(ctx.env.LOCALAPPDATA ?? ctx.home, "codex-router")
        : join(ctx.home, ".local", "share", "codex-router"));

const routerInstalled = (ctx: HarnessContext) =>
    readTextIfExists(join(routerDir(ctx), "package.json"))?.includes(
        '"codex-model-router"',
    ) ?? false;

/** Run one of the router's own commands (the scripts behind `model-router`). */
const router = (
    ctx: HarnessContext,
    script: string,
    args: string[],
    input?: string,
) => {
    const run = spawnSync(
        process.execPath,
        [join(routerDir(ctx), "src", script), ...args],
        { env: ctx.env, input, encoding: "utf-8" },
    );
    return { ok: run.status === 0, out: run.stdout, err: run.stderr };
};

const generic = (ctx: HarnessContext, ...args: string[]) =>
    router(ctx, "providers.mjs", ["generic", ...args]);

const descriptor = (ctx: HarnessContext) => {
    const run = generic(ctx, "show", PROVIDER, "--json");
    return run.ok
        ? (JSON.parse(run.out).provider as { baseUrl: string })
        : null;
};

const credentialSet = (ctx: HarnessContext) =>
    JSON.parse(generic(ctx, "credential", PROVIDER, "status", "--json").out)
        .configured === true;

/**
 * The router only reads a key from a hidden terminal prompt. Run its own
 * credential command with the prompt answered from stdin instead, so the key
 * never appears in argv, the environment, or shell history.
 */
const storeKey = (ctx: HarnessContext, key: string) => {
    const bridge =
        'import { pathToFileURL } from "node:url"; import { join } from "node:path";' +
        'const { runGenericCommand } = await import(pathToFileURL(join(process.env.POLLI_ROUTER_SRC, "providers.mjs")).href);' +
        'let key = ""; for await (const chunk of process.stdin) key += chunk;' +
        `await runGenericCommand(["credential", "${PROVIDER}", "set"], { prompt: () => key.trim() });`;
    const run = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", bridge],
        {
            env: { ...ctx.env, POLLI_ROUTER_SRC: join(routerDir(ctx), "src") },
            input: key,
            encoding: "utf-8",
        },
    );
    if (run.status !== 0) {
        throw new Error(`Codex Router rejected the key: ${run.stderr.trim()}`);
    }
};

/**
 * Curated models live in the router's own user-models file. Resolve it exactly
 * like the router does (`src/user-models.mjs` `USER_MODELS_PATH` over
 * `src/paths.mjs` `STATE_DIR`), so `status` sees the same models under any
 * state-dir override.
 */
const curatedModels = (ctx: HarnessContext): string[] => {
    const home = ctx.env.CODEX_HOME?.trim() || join(ctx.home, ".codex");
    const stateDir =
        ctx.env.MODEL_ROUTER_STATE_DIR?.trim() ||
        ctx.env.CODEX_ROUTER_STATE_DIR?.trim() ||
        ctx.env.KIMI_CODEX_STATE_DIR?.trim() ||
        join(home, "codex-router");
    const file =
        ctx.env.MODEL_ROUTER_USER_MODELS?.trim() ||
        join(stateDir, "user-models.json");
    const text = readTextIfExists(file);
    if (!text) return [];
    return (JSON.parse(text).models as { provider: string; slug: string }[])
        .filter((m) => m.provider === PROVIDER)
        .map((m) => m.slug);
};

const result = (ctx: HarnessContext): HarnessResult => {
    const details: Record<string, string | boolean> = {
        router: routerInstalled(ctx),
        client: commandExists("codex", ctx.env),
    };
    const base = { harness: ID, label: LABEL, files: [], details };
    if (!details.router) {
        details.next = `Install Codex Router: ${ROUTER_INSTALL}`;
        return { ...base, configured: false };
    }
    details.provider = descriptor(ctx) !== null;
    details.key = details.provider ? credentialSet(ctx) : false;
    const models = curatedModels(ctx);
    if (!details.client) {
        details.next = "Install Codex: https://github.com/openai/codex";
    }
    return {
        ...base,
        configured: Boolean(details.provider && details.key && models.length),
        model: models[0],
    };
};

const fail = (run: { err: string; out: string }, what: string) =>
    new Error(`${what}: ${(run.err || run.out).trim().slice(0, 400)}`);

/**
 * Add the Pollinations provider and one model to Codex Router, asking for a
 * key only when the router has none. A failed smoke test undoes what this run
 * added and leaves anything that was already there.
 */
export const configureCodex = async (
    ctx: HarnessContext,
    model: string,
    getKey: () => Promise<string>,
) => {
    const existing = descriptor(ctx);
    const added = existing === null;
    if (added || existing.baseUrl !== `${BASE_URL}/v1`) {
        const run = generic(
            ctx,
            added ? "add" : "edit",
            PROVIDER,
            "--name",
            "Pollinations",
            "--base-url",
            `${BASE_URL}/v1`,
            "--adapter",
            "openai-chat",
            "--no-apply",
        );
        if (!run.ok) throw fail(run, "Codex Router");
    }
    try {
        if (!credentialSet(ctx)) storeKey(ctx, await getKey());
        const curate = router(ctx, "curate-models.mjs", [
            PROVIDER,
            "--models",
            model,
            "--apply",
        ]);
        if (!curate.ok) throw fail(curate, "Codex Router");
        const since = Date.now();
        const smoke = router(ctx, "compatibility-test.mjs", [
            `${PROVIDER}/${model}`,
            "--live",
            "--yes",
            "--quick",
            "--json",
        ]);
        if (!smoke.ok)
            throw fail(smoke, "Smoke test through Codex Router failed");
        await assertKeyUsage(harnessKeyName(ID), since);
    } catch (error) {
        if (added) generic(ctx, "remove", PROVIDER);
        else {
            router(ctx, "curate-models.mjs", [
                PROVIDER,
                "--remove",
                model,
                "--apply",
            ]);
        }
        throw error;
    }
};

export const codex: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Add Pollinations to Codex through Codex Router",
    restartHint:
        "Fully quit and reopen Codex, then pick the Pollinations model in its model picker.",

    async on(ctx, options) {
        if (!routerInstalled(ctx)) {
            throw new Error(
                `Codex Router was not found. Install it first: ${ROUTER_INSTALL}`,
            );
        }
        if (!commandExists("codex", ctx.env)) {
            throw new Error(
                "Codex was not found. Install it first: https://github.com/openai/codex",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        await fetchHarnessModels(model);
        await configureCodex(ctx, model, () =>
            resolveHarnessKey(
                {
                    id: ID,
                    label: LABEL,
                    existingKey: null,
                    accountPermissions: ["usage"],
                },
                { browser: options.browser },
            ),
        );
        return result(ctx);
    },

    off(ctx) {
        // Removing the descriptor also removes its credential and curated routes.
        const owned = routerInstalled(ctx) && descriptor(ctx) !== null;
        if (owned) generic(ctx, "remove", PROVIDER);
        return {
            ...result(ctx),
            configured: false,
            outcome: owned ? "stripped" : "unchanged",
        };
    },

    status: result,
};

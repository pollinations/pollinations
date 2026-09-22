import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import { commandExists, readTextIfExists } from "./fs.js";
import { keyIsValid, resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";

const ID = "codex";
const LABEL = "Codex";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const ROUTER_INSTALL =
    "https://github.com/duolahypercho/codex-router#install-everything-recommended";
const CODEX_INSTALL = "npm install -g @openai/codex";
const MIN_ROUTER_NODE = "22.19.0";
/** First router release with `providers generic credential … --stdin`. */
const MIN_ROUTER_VERSION = "0.5.0";

export const codexHome = (ctx: HarnessContext) =>
    ctx.env.CODEX_HOME?.trim() || join(ctx.home, ".codex");

/** The router checkout: CODEX_ROUTER_HOME, else the platform default. */
export const routerDir = (ctx: HarnessContext) =>
    ctx.env.CODEX_ROUTER_HOME?.trim() ||
    (process.platform === "win32"
        ? join(
              ctx.env.LOCALAPPDATA ?? join(ctx.home, "AppData", "Local"),
              "codex-router",
          )
        : join(ctx.home, ".local", "share", "codex-router"));

export const stateDir = (ctx: HarnessContext) =>
    ctx.env.CODEX_ROUTER_STATE_DIR?.trim() ||
    ctx.env.KIMI_CODEX_STATE_DIR?.trim() ||
    join(codexHome(ctx), "codex-router");

export const routerInstalled = (ctx: HarnessContext) => {
    const pkg = readTextIfExists(join(routerDir(ctx), "package.json"));
    return pkg?.includes('"codex-model-router"') ?? false;
};

const routerVersion = (ctx: HarnessContext): string | null => {
    const text = readTextIfExists(join(routerDir(ctx), "package.json"));
    if (!text) return null;
    try {
        const { version } = JSON.parse(text) as { version?: string };
        return version ?? null;
    } catch {
        return null;
    }
};

const atLeast = (version: string, minimum: string) => {
    const a = version.split(".").map(Number);
    const b = minimum.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0);
        if (diff !== 0) return diff > 0;
    }
    return true;
};

const routerVersionSupported = (version: string | null) =>
    version !== null && atLeast(version, MIN_ROUTER_VERSION);

const nodeSupported = (node: string | null) =>
    node !== null && atLeast(node, MIN_ROUTER_NODE);

const nodeVersion = (ctx: HarnessContext): string | null => {
    const run = spawnSync(process.execPath, ["--version"], {
        env: ctx.env,
        encoding: "utf-8",
        timeout: 10_000,
    });
    if (run.status !== 0) return null;
    const match = (run.stdout ?? "").match(/v(\d+\.\d+\.\d+)/);
    return match?.[1] ?? null;
};

/** Files the router's generic-provider + curation path owns for this setup. */
const snapshotFiles = (ctx: HarnessContext) => [
    join(stateDir(ctx), "generic-providers.json"),
    join(stateDir(ctx), "provider-credentials.json"),
    join(stateDir(ctx), "user-models.json"),
    join(stateDir(ctx), "model-picker-state.json"),
    join(stateDir(ctx), "generic-provider-credentials", `${PROVIDER}.key`),
];

interface RouterRun {
    ok: boolean;
    out: string;
    err: string;
}

/** Run one of the router's own scripts (the code behind `bin/model-router`). */
const router = (
    ctx: HarnessContext,
    script: string,
    args: string[],
    input?: string,
): RouterRun => {
    const run = spawnSync(
        process.execPath,
        [join(routerDir(ctx), "src", script), ...args],
        { env: ctx.env, input, encoding: "utf-8", timeout: 180_000 },
    );
    return {
        ok: run.status === 0,
        out: run.stdout ?? "",
        err: run.stderr ?? "",
    };
};

const generic = (
    ctx: HarnessContext,
    args: string[],
    input?: string,
): RouterRun => router(ctx, "providers.mjs", ["generic", ...args], input);

const descriptor = (ctx: HarnessContext): { baseUrl: string } | null => {
    const run = generic(ctx, ["show", PROVIDER, "--json"]);
    if (!run.ok) return null;
    try {
        const parsed = JSON.parse(run.out) as {
            provider?: { baseUrl: string };
        };
        return parsed.provider ?? null;
    } catch {
        return null;
    }
};

const credentialSet = (ctx: HarnessContext): boolean | null => {
    const run = generic(ctx, ["credential", PROVIDER, "status", "--json"]);
    if (!run.ok) return null;
    try {
        const parsed = JSON.parse(run.out) as { configured?: boolean };
        return parsed.configured === true;
    } catch {
        return null;
    }
};

/**
 * Hand the key to the router over stdin (`credential set --stdin`), so it
 * never appears in argv, the environment, or shell history.
 */
const storeKey = (ctx: HarnessContext, key: string) => {
    const run = generic(ctx, ["credential", PROVIDER, "set", "--stdin"], key);
    if (!run.ok) {
        throw new Error(
            `Codex Router rejected the key: ${(run.err || run.out).trim().slice(0, 400)}`,
        );
    }
};

const storedKey = (ctx: HarnessContext): string | null => {
    const text = readTextIfExists(
        join(stateDir(ctx), "generic-provider-credentials", `${PROVIDER}.key`),
    );
    const trimmed = text?.trim();
    return trimmed ? trimmed : null;
};

const curatedModels = (ctx: HarnessContext): string[] => {
    const text = readTextIfExists(join(stateDir(ctx), "user-models.json"));
    if (!text) return [];
    try {
        const parsed = JSON.parse(text) as {
            models?: { provider?: string; slug?: string }[];
        };
        return (parsed.models ?? [])
            .filter((m) => m.provider === PROVIDER && m.slug)
            .map((m) => m.slug as string);
    } catch {
        return [];
    }
};

const fail = (run: RouterRun, what: string) =>
    new Error(`${what}: ${(run.err || run.out).trim().slice(0, 400)}`);

const result = (ctx: HarnessContext): HarnessResult => {
    const version = routerVersion(ctx);
    const node = nodeVersion(ctx);
    const details: Record<string, string | boolean> = {
        router: routerInstalled(ctx),
        client: commandExists("codex", ctx.env),
        version: version ?? "unknown",
        node: node ?? "unknown",
    };
    const base = { harness: ID, label: LABEL, files: [], details };

    if (!details.router) {
        details.next = `Install Codex Router: ${ROUTER_INSTALL}`;
        return { ...base, configured: false };
    }
    if (!routerVersionSupported(version)) {
        details.next = `Upgrade Codex Router (need >= ${MIN_ROUTER_VERSION}): ${ROUTER_INSTALL}`;
        return { ...base, configured: false };
    }
    if (!nodeSupported(node)) {
        details.next = `Codex Router needs Node >= ${MIN_ROUTER_NODE}`;
        return { ...base, configured: false };
    }
    if (!details.client) {
        details.next = `Install Codex: ${CODEX_INSTALL}`;
    }

    const provider = descriptor(ctx);
    const cred = provider ? credentialSet(ctx) : false;
    details.provider = provider !== null;
    details.key = cred === true;
    const models = curatedModels(ctx);

    return {
        ...base,
        configured: Boolean(provider && cred && models.length),
        model: models[0]?.replace(`${PROVIDER}/`, ""),
    };
};

/**
 * Add the Pollinations provider and one model through the router's own
 * commands. A failed smoke test undoes what this run added via the shared
 * file snapshot (byte-for-byte restore of the pre-`on` files).
 */
export const configureCodex = async (
    ctx: HarnessContext,
    model: string,
    getKey: () => Promise<string>,
): Promise<void> => {
    const existing = descriptor(ctx);
    const added = existing === null;
    const needsEdit = !added && existing?.baseUrl !== `${BASE_URL}/v1`;
    // --no-apply is only safe while no curated routes exist for this provider
    // (the router refuses it otherwise); a fresh `add` has none.
    const noApply = added ? ["--no-apply"] : [];
    // Resolve the key before the synchronous snapshot body so an interactive
    // or network-backed mint is never held inside a file lock.
    const needKey = credentialSet(ctx) !== true;
    const key = needKey ? await getKey() : null;

    applyWithSnapshot(ctx, ID, snapshotFiles(ctx), () => {
        if (added || needsEdit) {
            const run = generic(ctx, [
                added ? "add" : "edit",
                PROVIDER,
                "--name",
                "Pollinations",
                "--base-url",
                `${BASE_URL}/v1`,
                "--adapter",
                "openai-chat",
                ...noApply,
            ]);
            if (!run.ok) throw fail(run, "Codex Router");
        }
        if (key !== null) storeKey(ctx, key);
        const curate = router(ctx, "curate-models.mjs", [
            PROVIDER,
            "--models",
            model,
            "--apply",
        ]);
        if (!curate.ok) throw fail(curate, "Codex Router curate-models");
        const smoke = router(ctx, "compatibility-test.mjs", [
            `${PROVIDER}/${model}`,
            "--live",
            "--yes",
            "--quick",
            "--json",
        ]);
        if (!smoke.ok) {
            throw fail(smoke, "Smoke test through Codex Router failed");
        }
    });
};

export const disableCodex = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, snapshotFiles(ctx), () => {
        if (!routerInstalled(ctx) || descriptor(ctx) === null) return false;
        // Removing the provider also removes its credential and curated routes.
        return generic(ctx, ["remove", PROVIDER]).ok;
    });
    return { ...result(ctx), configured: false, outcome };
};

/** Reuse a still-valid key already in the router's protected store. */
const reuseStoredKey = async (ctx: HarnessContext): Promise<string | null> => {
    const stored = storedKey(ctx);
    if (!stored) return null;
    try {
        return (await keyIsValid(stored)) ? stored : null;
    } catch {
        return null;
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
        const version = routerVersion(ctx);
        if (!routerVersionSupported(version)) {
            throw new Error(
                `Codex Router ${version ?? "(unknown)"} is too old. Upgrade: ${ROUTER_INSTALL}`,
            );
        }
        const node = nodeVersion(ctx);
        if (!nodeSupported(node)) {
            throw new Error(
                `Codex Router needs Node >= ${MIN_ROUTER_NODE} (found ${node ?? "unknown"})`,
            );
        }
        if (!commandExists("codex", ctx.env)) {
            throw new Error(
                `Codex was not found. Install it first: ${CODEX_INSTALL}`,
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        await fetchHarnessModels(model);
        await configureCodex(ctx, model, async () => {
            const reused = await reuseStoredKey(ctx);
            if (reused) return reused;
            return resolveHarnessKey(
                {
                    id: ID,
                    label: LABEL,
                    existingKey: storedKey(ctx),
                    accountPermissions: ["usage"],
                },
                { browser: options.browser },
            );
        });
        return result(ctx);
    },

    off: disableCodex,
    status: result,
};

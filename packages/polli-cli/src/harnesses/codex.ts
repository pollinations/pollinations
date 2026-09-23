import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { commandExists, readTextIfExists } from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";
import { gen } from "../lib/api.js";

const ID = "codex";
const LABEL = "Codex";
// Cheap, tool-capable, first-party. `--model` always wins; this only has to
// exist in the live catalog, which every `on` validates.
const DEFAULT_MODEL = "z-ai/glm-5.3-flash";
const POLLINATIONS_BASE_URL = "https://gen.pollinations.ai/v1";
const PROVIDER_ID = "pollinations";
const ROUTER_CHECKOUT = join(".local", "share", "codex-router", "bin");

// Codex reads ~/.codex (CODEX_HOME) and codex-router resolves the same way
// (src/paths.mjs), with the router's state defaulting to ~/.codex/codex-router
// unless MODEL_ROUTER_STATE_DIR / CODEX_ROUTER_STATE_DIR move it.
const codexHomeDir = (ctx: HarnessContext) =>
    ctx.env.CODEX_HOME?.trim() || join(ctx.home, ".codex");

const routerStateDir = (ctx: HarnessContext) =>
    ctx.env.MODEL_ROUTER_STATE_DIR?.trim() ||
    ctx.env.CODEX_ROUTER_STATE_DIR?.trim() ||
    join(codexHomeDir(ctx), "codex-router");

const files = (ctx: HarnessContext) => [
    join(codexHomeDir(ctx), "config.toml"),
    join(routerStateDir(ctx), "generic-providers.json"),
    join(routerStateDir(ctx), "provider-credentials.json"),
    join(routerStateDir(ctx), "enabled-providers.json"),
    join(routerStateDir(ctx), "user-models.json"),
    join(
        routerStateDir(ctx),
        "generic-provider-credentials",
        `${PROVIDER_ID}.key`,
    ),
];

/**
 * The router ships in two shapes: a Homebrew `codex-router` multiplexer on
 * PATH, and a checkout whose bin/ holds `model-router codex <args>` plus
 * `curate-models`. Resolve both once; every call below goes through these.
 */
const routerCommands = (ctx: HarnessContext) => {
    const brew = commandExists("codex-router", ctx.env, []);
    if (brew) {
        return {
            router: (args: string[], options?: { input?: string }) =>
                execFileSync("codex-router", args, {
                    input: options?.input,
                    timeout: 120_000,
                    encoding: "utf-8",
                    env: { ...ctx.env, CODEX_HOME: codexHomeDir(ctx) },
                }),
            curate: (args: string[]) =>
                execFileSync("codex-router", ["curate-models", ...args], {
                    timeout: 300_000,
                    encoding: "utf-8",
                    env: { ...ctx.env, CODEX_HOME: codexHomeDir(ctx) },
                }),
        };
    }
    const onPath = commandExists("model-router", ctx.env, []);
    const bin = onPath
        ? "model-router"
        : join(ctx.home, ROUTER_CHECKOUT, "model-router");
    const curateBin = onPath
        ? "curate-models"
        : join(ctx.home, ROUTER_CHECKOUT, "curate-models");
    const spawnEnv = { ...ctx.env, CODEX_HOME: codexHomeDir(ctx) };
    return {
        router: (args: string[], options?: { input?: string }) =>
            execFileSync(bin, ["codex", ...args], {
                input: options?.input,
                timeout: 120_000,
                encoding: "utf-8",
                env: spawnEnv,
            }),
        curate: (args: string[]) =>
            execFileSync(curateBin, args, {
                timeout: 300_000,
                encoding: "utf-8",
                env: spawnEnv,
            }),
    };
};

interface RouterShow {
    provider?: {
        id?: string;
        enabled?: boolean;
        baseUrl?: string;
        credentialRef?: string | null;
    };
}

const showProvider = (ctx: HarnessContext): RouterShow | null => {
    try {
        return JSON.parse(
            routerCommands(ctx).router([
                "providers",
                "generic",
                "show",
                PROVIDER_ID,
                "--json",
            ]),
        ) as RouterShow;
    } catch {
        return null;
    }
};

// The router keeps the generic provider's key in its own protected
// credential file. Reading it back is how a second `on` reuses the same
// child key instead of minting another; it never leaves router-owned
// storage.
const readRouterKey = (ctx: HarnessContext): string | null =>
    readTextIfExists(
        join(
            routerStateDir(ctx),
            "generic-provider-credentials",
            `${PROVIDER_ID}.key`,
        ),
    )?.trim() || null;

const readDiscoveryMode = (
    ctx: HarnessContext,
): "enabled" | "disabled" | null => {
    const text = readTextIfExists(
        join(routerStateDir(ctx), "discovery-mode.json"),
    );
    if (!text) return null;
    try {
        const parsed = JSON.parse(text) as { discovery?: string };
        if (parsed.discovery === "disabled") return "disabled";
        if (parsed.discovery === "enabled") return "enabled";
        return null;
    } catch {
        return null;
    }
};

/**
 * The full connect sequence, driven entirely through the router's own
 * commands. Synchronous spawns so applyWithSnapshot can roll everything
 * back if a step fails. The credential travels over stdin, never argv.
 */
const configureViaRouter = (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string },
) => {
    if (readDiscoveryMode(ctx) === "disabled") {
        throw new Error(
            "Codex Router was installed with --no-discovery, so it will not read the provider credential file. Re-run the Codex Router installer without --no-discovery first.",
        );
    }
    const { router, curate } = routerCommands(ctx);
    const descriptor = [
        "--name",
        "Pollinations",
        "--base-url",
        POLLINATIONS_BASE_URL,
        "--adapter",
        "openai-chat",
    ];
    if (showProvider(ctx)) {
        router(["providers", "generic", "edit", PROVIDER_ID, ...descriptor]);
    } else {
        router(["providers", "generic", "add", PROVIDER_ID, ...descriptor]);
    }
    router(["providers", "generic", "credential", PROVIDER_ID, "set", "--stdin"], {
        input: settings.apiKey,
    });
    router(["providers", "enable", PROVIDER_ID]);
    // Publish the selected model from Pollinations' live catalog; the
    // router fetches that catalog itself when listing candidates.
    curate([PROVIDER_ID, "--models", settings.model, "--apply"]);
};

const readCuratedModel = (ctx: HarnessContext): string | undefined => {
    const curated = readTextIfExists(
        join(routerStateDir(ctx), "user-models.json"),
    );
    if (!curated) return undefined;
    try {
        const parsed = JSON.parse(curated) as {
            models?: Array<{ provider?: string; upstreamModel?: string }>;
        };
        const ours = parsed.models?.filter(
            (model) => model.provider === PROVIDER_ID,
        );
        return ours?.at(-1)?.upstreamModel;
    } catch {
        // A hand-edited or future-shaped document: fall back to the slug
        // format the router has always written.
        return curated.match(new RegExp(`"${PROVIDER_ID}/([^"]+)"`))?.[1];
    }
};

const result = (ctx: HarnessContext): HarnessResult => {
    const show = showProvider(ctx);
    const enabled = show?.provider?.enabled === true;
    const model = readCuratedModel(ctx);
    return {
        harness: ID,
        label: LABEL,
        configured: Boolean(enabled && model && readRouterKey(ctx)),
        model,
        files: files(ctx),
    };
};

// Resolve the codex client the same way commandExists does for the checks.
const codexBin = (ctx: HarnessContext) =>
    commandExists("codex", ctx.env, [])
        ? "codex"
        : join(ctx.home, ".local", "bin", "codex");

/**
 * One-word generation through the real client and router — the cheapest
 * proof that Codex → Codex Router → Pollinations works, run before the
 * user spends anything real. `codex exec` streams over the Responses wire
 * the router publishes into config.toml.
 */
const smoke = (ctx: HarnessContext, model: string) => {
    let output: string;
    try {
        output = execFileSync(
            codexBin(ctx),
            [
                "exec",
                "--skip-git-repo-check",
                "--sandbox",
                "read-only",
                "--model",
                `${PROVIDER_ID}/${model}`,
                "Reply with exactly one word: pong",
            ],
            {
                timeout: 120_000,
                encoding: "utf-8",
                env: { ...ctx.env, CODEX_HOME: codexHomeDir(ctx) },
            },
        );
    } catch (error) {
        throw new Error(
            `Smoke request through Codex Router failed: ${error instanceof Error ? error.message.split("\n")[0] : error}`,
        );
    }
    if (!/pong/i.test(output)) {
        throw new Error("Smoke request did not answer pong.");
    }
};

export const configureCodex = (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string },
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => {
        configureViaRouter(ctx, settings);
        smoke(ctx, settings.model);
    });
    return result(ctx);
};

export const disableCodex = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => {
        // The router's own removal is surgical: descriptor, credential,
        // curated routes, and every dependent binding, in one transaction.
        // The router's own managed block in config.toml stays — that is the
        // router's install, not a Pollinations entry.
        try {
            routerCommands(ctx).router([
                "providers",
                "generic",
                "remove",
                PROVIDER_ID,
            ]);
        } catch {
            return false;
        }
        return true;
    });
    // Disk truth wins: a byte-for-byte restore may legitimately bring
    // back a pre-existing Pollinations setup the user had before `on`.
    return { ...result(ctx), outcome };
};

const codexInstalled = (ctx: HarnessContext) =>
    commandExists("codex", ctx.env, [join(ctx.home, ".local", "bin", "codex")]);

const routerInstalled = (ctx: HarnessContext) =>
    commandExists("codex-router", ctx.env, []) ||
    commandExists("model-router", ctx.env, []) ||
    commandExists("model-router", ctx.env, [
        join(ctx.home, ROUTER_CHECKOUT, "model-router"),
    ]);

export const codex: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Codex through Codex Router to use Pollinations",
    restartHint:
        "Fully quit and reopen Codex (or the ChatGPT app), then pick a pollinations/ model from the picker.",

    async on(ctx, options) {
        if (!codexInstalled(ctx)) {
            throw new Error(
                "Codex was not found. Install it first: npm install -g @openai/codex",
            );
        }
        if (!routerInstalled(ctx)) {
            throw new Error(
                "Codex Router was not found. Install it first: curl -fsSL https://raw.githubusercontent.com/duolahypercho/codex-router/main/install.sh | sh -s -- --target codex --guided",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: readRouterKey(ctx),
                accountPermissions: ["profile", "usage"],
            },
            { browser: options.browser },
        );
        const result = configureCodex(ctx, { apiKey, model });
        // Usage side effect under the dedicated key: the routed smoke
        // request should be visible to the key that paid for it. Courtesy
        // check — the pong already proved the authenticated round trip.
        try {
            await gen("/account/usage/daily", { apiKey });
        } catch {
            // Usage reporting can lag; never fail a working setup over it.
        }
        return result;
    },

    off: disableCodex,
    status: result,
};

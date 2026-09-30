import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import { commandExists, readTextIfExists } from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";
import { keyUsageCount, waitForKeyUsageIncrease } from "./usage-proof.js";

const ID = "codex";
const LABEL = "Codex";
const PROVIDER = "pollinations";
const OWNER_MARKER = "managed-by=polli-harness-codex";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const MIN_ROUTER_VERSION = [0, 6, 0] as const;
const ROUTER_INSTALL =
    "https://github.com/duolahypercho/codex-router#install-everything-recommended";

interface GenericProvider {
    id: string;
    displayName?: string;
    baseUrl: string;
    adapter?: string;
    description?: string;
    credentialRef?: string;
    enabled?: boolean;
}

interface RouterRun {
    ok: boolean;
    out: string;
    err: string;
}

const routerRoot = (ctx: HarnessContext) =>
    ctx.env.CODEX_ROUTER_SOURCE_ROOT?.trim() ||
    ctx.env.MODEL_ROUTER_SOURCE_ROOT?.trim() ||
    ctx.env.CODEX_ROUTER_HOME?.trim() ||
    (process.platform === "win32"
        ? join(
              ctx.env.LOCALAPPDATA ?? join(ctx.home, "AppData", "Local"),
              "codex-router",
          )
        : join(
              ctx.env.XDG_DATA_HOME ?? join(ctx.home, ".local", "share"),
              "codex-router",
          ));

const routerInfo = (ctx: HarnessContext) => {
    const text = readTextIfExists(join(routerRoot(ctx), "package.json"));
    if (!text) return { installed: false, version: "" };
    try {
        const pkg = JSON.parse(text) as { name?: string; version?: string };
        return {
            installed: pkg.name === "codex-model-router",
            version: String(pkg.version ?? ""),
        };
    } catch {
        return { installed: false, version: "" };
    }
};

export const codexRouterVersionCompatible = (value: string) => {
    const current = value
        .trim()
        .replace(/^v/, "")
        .split(".")
        .slice(0, 3)
        .map((part) => Number.parseInt(part, 10));
    if (current.length < 3 || current.some(Number.isNaN)) return false;
    for (let index = 0; index < 3; index += 1) {
        if (current[index] > MIN_ROUTER_VERSION[index]) return true;
        if (current[index] < MIN_ROUTER_VERSION[index]) return false;
    }
    return true;
};

const runScript = (
    ctx: HarnessContext,
    script: string,
    args: string[],
    input?: string,
): RouterRun => {
    const run = spawnSync(
        process.execPath,
        [join(routerRoot(ctx), "src", script), ...args],
        {
            env: { ...process.env, ...ctx.env },
            input,
            encoding: "utf-8",
            windowsHide: true,
        },
    );
    return {
        ok: run.status === 0,
        out: run.stdout ?? "",
        err: run.stderr ?? "",
    };
};

const generic = (ctx: HarnessContext, ...args: string[]) =>
    runScript(ctx, "providers.mjs", ["generic", ...args]);

const parseJson = <T>(run: RouterRun, what: string): T => {
    if (!run.ok) {
        throw new Error(
            `${what}: ${(run.err || run.out).trim().slice(0, 500)}`,
        );
    }
    try {
        return JSON.parse(run.out) as T;
    } catch {
        throw new Error(`${what} returned invalid JSON.`);
    }
};

const provider = (ctx: HarnessContext): GenericProvider | null => {
    const run = generic(ctx, "show", PROVIDER, "--json");
    if (!run.ok) return null;
    return parseJson<{ provider: GenericProvider }>(
        run,
        "Codex Router provider status",
    ).provider;
};

const ownsProvider = (value: GenericProvider | null) =>
    Boolean(
        value &&
            value.description === OWNER_MARKER &&
            value.baseUrl.replace(/\/$/, "") === `${BASE_URL}/v1` &&
            value.adapter === "openai-chat",
    );

const credentialConfigured = (ctx: HarnessContext) => {
    const run = generic(ctx, "credential", PROVIDER, "status", "--json");
    if (!run.ok) return false;
    return (
        parseJson<{ configured?: boolean }>(
            run,
            "Codex Router credential status",
        ).configured === true
    );
};

const stateDir = (ctx: HarnessContext) =>
    ctx.env.MODEL_ROUTER_STATE_DIR?.trim() ||
    ctx.env.CODEX_ROUTER_STATE_DIR?.trim() ||
    ctx.env.KIMI_CODEX_STATE_DIR?.trim() ||
    join(
        ctx.env.CODEX_HOME?.trim() || join(ctx.home, ".codex"),
        "codex-router",
    );

const credentialPath = (ctx: HarnessContext) =>
    join(stateDir(ctx), "generic-provider-credentials", `${PROVIDER}.key`);

const storedKey = (ctx: HarnessContext) => {
    const text = readTextIfExists(credentialPath(ctx));
    return text?.trim() || null;
};

const setCredential = (ctx: HarnessContext, key: string) => {
    const bridge = [
        'import { pathToFileURL } from "node:url";',
        'import { join } from "node:path";',
        "const src = process.env.POLLI_CODEX_ROUTER_SRC;",
        'const mod = await import(pathToFileURL(join(src, "providers.mjs")).href);',
        'let value = "";',
        "for await (const chunk of process.stdin) value += chunk;",
        'await mod.runGenericCommand(["credential","pollinations","set","--json"],',
        "{ prompt: () => value.trim() });",
    ].join(" ");
    const run = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", bridge],
        {
            env: {
                ...process.env,
                ...ctx.env,
                POLLI_CODEX_ROUTER_SRC: join(routerRoot(ctx), "src"),
            },
            input: key,
            encoding: "utf-8",
            windowsHide: true,
        },
    );
    if (run.status !== 0) {
        throw new Error(
            `Codex Router rejected the dedicated key: ${(
                run.stderr || run.stdout
            )
                .trim()
                .slice(0, 500)}`,
        );
    }
};

const userModelsPath = (ctx: HarnessContext) =>
    ctx.env.MODEL_ROUTER_USER_MODELS?.trim() ||
    join(stateDir(ctx), "user-models.json");

const selectedModels = (ctx: HarnessContext): string[] => {
    const text = readTextIfExists(userModelsPath(ctx));
    if (!text) return [];
    try {
        const parsed = JSON.parse(text) as
            | { models?: { provider?: string; slug?: string }[] }
            | { provider?: string; slug?: string }[];
        const models = Array.isArray(parsed) ? parsed : (parsed.models ?? []);
        return models
            .filter((entry) => entry.provider === PROVIDER && entry.slug)
            .map((entry) => String(entry.slug))
            .map((slug) =>
                slug.startsWith(`${PROVIDER}/`)
                    ? slug.slice(PROVIDER.length + 1)
                    : slug,
            );
    } catch {
        return [];
    }
};

const addProvider = (ctx: HarnessContext) =>
    generic(
        ctx,
        "add",
        PROVIDER,
        "--name",
        "Pollinations",
        "--base-url",
        `${BASE_URL}/v1`,
        "--adapter",
        "openai-chat",
        "--description",
        OWNER_MARKER,
        "--no-apply",
        "--json",
    );

const removeProvider = (ctx: HarnessContext) =>
    generic(ctx, "remove", PROVIDER, "--json");

const curateModel = (ctx: HarnessContext, model: string) =>
    runScript(ctx, "curate-models.mjs", [
        PROVIDER,
        "--models",
        model,
        "--apply",
    ]);

const removeModel = (ctx: HarnessContext, model: string) =>
    runScript(ctx, "curate-models.mjs", [
        PROVIDER,
        "--remove",
        model,
        "--apply",
    ]);

const smoke = (ctx: HarnessContext, model: string) =>
    runScript(ctx, "compatibility-test.mjs", [
        `${PROVIDER}/${model}`,
        "--live",
        "--yes",
        "--quick",
        "--json",
    ]);

const failRun = (run: RouterRun, what: string) =>
    new Error(`${what}: ${(run.err || run.out).trim().slice(0, 500)}`);

const status = (ctx: HarnessContext): HarnessResult => {
    const info = routerInfo(ctx);
    const installed = info.installed;
    const version = info.version;
    const compatible = installed && codexRouterVersionCompatible(version);
    const client = commandExists("codex", ctx.env);
    const current = compatible ? provider(ctx) : null;
    const owned = ownsProvider(current);
    const key = owned && credentialConfigured(ctx);
    const models = owned ? selectedModels(ctx) : [];
    const next = !installed
        ? `Install Codex Router: ${ROUTER_INSTALL}`
        : !compatible
          ? `Upgrade Codex Router to >= ${MIN_ROUTER_VERSION.join(".")}.`
          : !client
            ? "Install Codex: https://github.com/openai/codex"
            : current && !owned
              ? "Provider id 'pollinations' exists but is not owned by Polli; rename or remove it manually."
              : !owned
                ? "Run: polli harness codex on"
                : !key
                  ? "Run 'on' again to repair the dedicated Pollinations key."
                  : models.length === 0
                    ? "Run 'on' with --model to curate a Pollinations model."
                    : "Ready.";
    return {
        harness: ID,
        label: LABEL,
        configured: Boolean(
            compatible && client && owned && key && models.length,
        ),
        model: models[0] ? `${PROVIDER}/${models[0]}` : undefined,
        files: [],
        routerInstalled: installed,
        routerVersion: version || undefined,
        routerCompatible: compatible,
        clientInstalled: client,
        providerReady: owned,
        keyReady: key,
        next,
    };
};

export const configureCodex = async (
    ctx: HarnessContext,
    model: string,
    options: { browser?: boolean } = {},
): Promise<HarnessResult> => {
    const current = provider(ctx);
    if (current && !ownsProvider(current)) {
        throw new Error(
            "Codex Router already has a provider named 'pollinations' that Polli does not own. No changes were made.",
        );
    }

    const addedProvider = current === null;
    const hadModel = selectedModels(ctx).includes(model);
    const previousKey = storedKey(ctx);
    let key: string | null = null;

    try {
        if (addedProvider) {
            const added = addProvider(ctx);
            if (!added.ok) throw failRun(added, "Codex Router provider setup");
        }

        key = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: previousKey,
            },
            { browser: options.browser },
        );
        if (key !== previousKey || !credentialConfigured(ctx)) {
            setCredential(ctx, key);
        }

        if (!hadModel) {
            const curated = curateModel(ctx, model);
            if (!curated.ok) {
                throw failRun(curated, "Codex Router model curation");
            }
        }

        const before = await keyUsageCount(key);
        const startedAt = Date.now();
        const check = smoke(ctx, model);
        if (!check.ok) {
            throw failRun(check, "Codex Router smoke test");
        }
        const result = parseJson<{
            ok?: boolean;
            results?: { name?: string; ok?: boolean }[];
        }>(check, "Codex Router smoke test");
        if (
            result.ok !== true ||
            !result.results?.some(
                (item) => item.name === "basic response" && item.ok === true,
            )
        ) {
            throw new Error(
                "Codex Router smoke test did not confirm a basic routed response.",
            );
        }
        await waitForKeyUsageIncrease(key, before, {
            afterMs: startedAt,
        });
        return { ...status(ctx), smokeVerified: true };
    } catch (error) {
        try {
            if (!hadModel && provider(ctx)) removeModel(ctx, model);
            if (addedProvider && ownsProvider(provider(ctx))) {
                removeProvider(ctx);
            } else if (previousKey && key && previousKey !== key) {
                setCredential(ctx, previousKey);
            }
        } catch {
            // Preserve the original failure; status exposes any remaining state.
        }
        throw error;
    }
};

export const codex: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Use Pollinations in Codex through Codex Router",
    restartHint:
        "Fully quit and reopen Codex, then choose the Pollinations model exposed by Codex Router.",

    async on(ctx, options) {
        const info = routerInfo(ctx);
        if (!info.installed) {
            throw new Error(
                `Codex Router was not found. Install it first: ${ROUTER_INSTALL}`,
            );
        }
        const version = info.version;
        if (!codexRouterVersionCompatible(version)) {
            throw new Error(
                `Codex Router ${version || "unknown"} is unsupported; upgrade to >= ${MIN_ROUTER_VERSION.join(".")} before Polli login or key creation.`,
            );
        }
        if (!commandExists("codex", ctx.env)) {
            throw new Error(
                "Codex was not found. Install it first: https://github.com/openai/codex",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        await fetchHarnessModels(model);
        return configureCodex(ctx, model, { browser: options.browser });
    },

    off(ctx) {
        const current = routerInfo(ctx).installed ? provider(ctx) : null;
        if (!current || !ownsProvider(current)) {
            return {
                ...status(ctx),
                configured: false,
                outcome: "unchanged",
            };
        }
        const run = removeProvider(ctx);
        if (!run.ok) throw failRun(run, "Codex Router cleanup");
        return {
            ...status(ctx),
            configured: false,
            outcome: "stripped",
        };
    },

    status,
};

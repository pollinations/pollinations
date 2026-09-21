import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { printInfo, printSuccess } from "../lib/output.js";
import {
    commandExists,
    readTextIfExists,
    removeIfExists,
    resolveHomePath,
    spawnCommand,
    withLock,
    writeTextAtomic,
} from "./fs.js";
import { keyIsValid, resolveHarnessKey, revokeHarnessKeys } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessOnOptions,
    HarnessResult,
} from "./types.js";

const ID = "codex";
const LABEL = "Codex (Codex Router)";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";

/**
 * Codex has no provider concept of its own here: the Codex Router
 * (duolahypercho/codex-router) sits between Codex and the upstream. The
 * adapter drives ONLY the router's documented command surface, pinned to an
 * exact commit so the command schema can never drift under us.
 *
 * The router's bin/* launchers are thin sh wrappers around `node src/*.mjs`
 * with MODEL_ROUTER_TARGET set (verified in bin/model-router and
 * src/providers.mjs at the pinned commit); invoking node directly is the
 * same entry point, portable to Windows, and immune to missing exec bits.
 */
const ROUTER_REPO = "https://github.com/duolahypercho/codex-router.git";
export const CODEX_ROUTER_PIN = "5e1b49e6e3fea1ada57f0e7fa6ca7612e9d17300";
const ROUTER_PIN = CODEX_ROUTER_PIN;
const ROUTER_VERSION = "0.6.0";

const PROVIDER_ID = "pollinations";
const PROVIDER_NAME = "Pollinations";
const PROVIDER_BASE_URL = "https://gen.pollinations.ai/v1";
const PROVIDER_ADAPTER = "openai-chat";
const CREDENTIAL_REF = "cred_pollinations";
const OWNERSHIP_MARKER = "managed-by: polli-cli harness codex";

/** Injectable seams so tests can drive the adapter without network/TTY. */
export const codexDeps = {
    fetchModels: fetchHarnessModels,
    resolveKey: resolveHarnessKey,
    revokeKeys: revokeHarnessKeys,
    validateKey: keyIsValid,
    gitHead: (dir: string): string =>
        (
            spawnSync("git", ["-C", dir, "rev-parse", "HEAD"], {
                encoding: "utf-8",
            }).stdout ?? ""
        ).trim(),
    smokeTest: undefined as
        | undefined
        | ((ctx: HarnessContext, model: string) => void),
};

/* ---------------------------------------------------------------- paths */

const polliStateDir = (ctx: HarnessContext) =>
    join(ctx.home, ".pollinations", "harnesses", ID);
const routerDir = (ctx: HarnessContext) =>
    join(polliStateDir(ctx), "codex-router");
const manifestPath = (ctx: HarnessContext) =>
    join(polliStateDir(ctx), "manifest.json");
const txPath = (ctx: HarnessContext) => join(polliStateDir(ctx), "tx.json");
const lockDir = (ctx: HarnessContext) => join(polliStateDir(ctx), "lock");

const codexHome = (ctx: HarnessContext) =>
    ctx.env.CODEX_HOME?.trim()
        ? resolveHomePath(ctx.home, ctx.env.CODEX_HOME)
        : join(ctx.home, ".codex");

/** Mirror of src/paths.mjs STATE_DIR resolution at the pinned commit. */
const routerStateDir = (ctx: HarnessContext) => {
    const override =
        ctx.env.MODEL_ROUTER_STATE_DIR?.trim() ||
        ctx.env.CODEX_ROUTER_STATE_DIR?.trim() ||
        ctx.env.KIMI_CODEX_STATE_DIR?.trim();
    return override
        ? resolveHomePath(ctx.home, override)
        : join(codexHome(ctx), "codex-router");
};

/** The only file polli writes with its own hands (owner decision, spec v28.2). */
const credentialFile = (ctx: HarnessContext) =>
    join(
        routerStateDir(ctx),
        "generic-provider-credentials",
        `${PROVIDER_ID}.key`,
    );

/* --------------------------------------------------------- router CLI */

const ROUTER_SCRIPTS: Record<string, string> = {
    providers: "src/providers.mjs",
    "curate-models": "src/curate-models.mjs",
    doctor: "src/doctor.mjs",
    "smoke-test": "src/smoke-test.mjs",
};

interface RouterRun {
    status: number;
    stdout: string;
    stderr: string;
}

class RouterError extends Error {
    run: RouterRun;
    constructor(command: string, run: RouterRun) {
        super(
            `Codex Router "${command}" failed (exit ${run.status}): ${
                run.stderr.trim() || run.stdout.trim() || "no output"
            }`,
        );
        this.run = run;
    }
}

const runRouter = (
    ctx: HarnessContext,
    command: keyof typeof ROUTER_SCRIPTS,
    args: string[],
): RouterRun => {
    const script = join(routerDir(ctx), ROUTER_SCRIPTS[command]);
    const ran = spawnSync(process.execPath, [script, ...args], {
        encoding: "utf-8",
        timeout: 180_000,
        env: {
            ...ctx.env,
            HOME: ctx.env.HOME ?? ctx.home,
            MODEL_ROUTER_TARGET: "codex",
        },
    });
    const run: RouterRun = {
        status: ran.status ?? 1,
        stdout: ran.stdout ?? "",
        stderr: ran.stderr ?? (ran.error ? String(ran.error) : ""),
    };
    if (run.status !== 0)
        throw new RouterError(`${command} ${args.join(" ")}`, run);
    return run;
};

/**
 * The router's documented "no such provider" signal at the pinned commit
 * ("Unknown generic provider: <id>", src/generic-providers.mjs). ONLY this
 * message may be read as absence - timeouts, corrupt state, or script bugs
 * must abort the operation, not masquerade as "nothing to clean up".
 */
const NOT_FOUND = /Unknown generic provider/;

class ProviderMissing extends Error {}

const runRouterOrMissing = (
    ctx: HarnessContext,
    command: keyof typeof ROUTER_SCRIPTS,
    args: string[],
): RouterRun => {
    try {
        return runRouter(ctx, command, args);
    } catch (error) {
        if (
            error instanceof RouterError &&
            NOT_FOUND.test(`${error.run.stderr}\n${error.run.stdout}`)
        ) {
            throw new ProviderMissing();
        }
        throw error;
    }
};

/* --------------------------------------------------- durable contexts */

interface ProviderState {
    exists: boolean;
    owned: boolean;
    enabled: boolean;
}

interface CodexBaseline {
    created_by_us: boolean;
    enabled_at_first_on: boolean;
    models_added_by_us: string[];
    first_on_at: string;
}

interface CodexTx {
    step: "intent" | "minted" | "committed";
    pre: ProviderState | null;
    models_delta: string[];
    started_at: string;
}

const readJsonFile = <T>(path: string): T | null => {
    const text = readTextIfExists(path);
    if (text === null) return null;
    return JSON.parse(text) as T;
};

const loadBaseline = (ctx: HarnessContext) =>
    readJsonFile<CodexBaseline>(manifestPath(ctx));
const saveBaseline = (ctx: HarnessContext, baseline: CodexBaseline) =>
    writeTextAtomic(
        manifestPath(ctx),
        `${JSON.stringify(baseline, null, 2)}\n`,
        0o600,
    );
const loadTx = (ctx: HarnessContext) => readJsonFile<CodexTx>(txPath(ctx));
const saveTx = (ctx: HarnessContext, tx: CodexTx) =>
    writeTextAtomic(txPath(ctx), `${JSON.stringify(tx, null, 2)}\n`, 0o600);
const clearTx = (ctx: HarnessContext) => removeIfExists(txPath(ctx));

/* ------------------------------------------------------ provider state */

const showProvider = (ctx: HarnessContext) => {
    try {
        const run = runRouterOrMissing(ctx, "providers", [
            "generic",
            "show",
            PROVIDER_ID,
            "--json",
        ]);
        return (
            (
                JSON.parse(run.stdout) as {
                    provider?: Record<string, unknown>;
                }
            ).provider ?? {}
        );
    } catch (error) {
        if (error instanceof ProviderMissing) return null;
        throw error;
    }
};

const readProviderState = (ctx: HarnessContext): ProviderState => {
    const provider = showProvider(ctx);
    if (provider === null) {
        return { exists: false, owned: false, enabled: false };
    }
    return {
        exists: true,
        owned: String(provider.description ?? "").includes(OWNERSHIP_MARKER),
        enabled: provider.enabled === true,
    };
};

const curatedModels = (ctx: HarnessContext): string[] => {
    const provider = showProvider(ctx);
    if (provider === null) return [];
    const list = Array.isArray(provider.curatedModels)
        ? provider.curatedModels
        : Array.isArray(provider.models)
          ? provider.models
          : [];
    return list.filter((m): m is string => typeof m === "string");
};

const credentialConfigured = (ctx: HarnessContext): boolean => {
    try {
        const run = runRouterOrMissing(ctx, "providers", [
            "generic",
            "credential",
            PROVIDER_ID,
            "status",
            "--json",
        ]);
        return (
            (JSON.parse(run.stdout) as { configured?: boolean }).configured ===
            true
        );
    } catch (error) {
        if (error instanceof ProviderMissing) return false;
        throw error;
    }
};

/* --------------------------------------------------------- version gate */

class RefusedError extends Error {
    exitCode = 2;
}

const refuse = (message: string): never => {
    throw new RefusedError(message);
};

const ensureCodexCli = (ctx: HarnessContext) => {
    if (!commandExists("codex", ctx.env)) {
        refuse(
            "Codex CLI was not found. Install it first (https://github.com/openai/codex), then re-run `polli harness codex on`.",
        );
    }
    const ran = spawnCommand("codex", ["--version"], {
        encoding: "utf-8",
        env: ctx.env,
    });
    const version = (ran.stdout ?? "").trim();
    if (ran.status !== 0 || !/\d+\.\d+\.\d+/.test(version)) {
        refuse(
            `Could not parse \`codex --version\` output ("${version || "empty"}"). Refusing to mutate an unknown Codex version.`,
        );
    }
};

const routerPinned = (ctx: HarnessContext): boolean => {
    const dir = routerDir(ctx);
    if (!existsSync(join(dir, "package.json"))) return false;
    if (codexDeps.gitHead(dir) !== ROUTER_PIN) return false;
    try {
        const pkg = JSON.parse(
            readTextIfExists(join(dir, "package.json")) ?? "{}",
        ) as { version?: string };
        return pkg.version === ROUTER_VERSION;
    } catch {
        return false;
    }
};

const ensureRouter = (ctx: HarnessContext) => {
    const dir = routerDir(ctx);
    if (existsSync(join(dir, "package.json"))) {
        if (!routerPinned(ctx)) {
            refuse(
                `Codex Router at ${dir} is not at the supported pin ${ROUTER_PIN} (v${ROUTER_VERSION}). Refusing to drive an unknown version; move it away or reset it with: git -C "${dir}" fetch && git -C "${dir}" checkout ${ROUTER_PIN}`,
            );
        }
        return;
    }
    printInfo(
        `Installing Codex Router v${ROUTER_VERSION} (pinned ${ROUTER_PIN.slice(0, 8)}) into ${dir} ...`,
    );
    const clone = spawnSync("git", ["clone", ROUTER_REPO, dir], {
        stdio: "inherit",
    });
    if (clone.status !== 0) {
        refuse(
            `Could not clone ${ROUTER_REPO}. Check git/network, or clone it yourself to ${dir} and check out ${ROUTER_PIN}.`,
        );
    }
    const checkout = spawnSync("git", ["-C", dir, "checkout", ROUTER_PIN], {
        stdio: "inherit",
    });
    if (checkout.status !== 0 || !routerPinned(ctx)) {
        refuse(
            `Codex Router clone is not at the supported pin ${ROUTER_PIN}. Refusing to continue.`,
        );
    }
};

const ensureDoctor = (ctx: HarnessContext) => {
    let run: RouterRun;
    try {
        run = runRouter(ctx, "doctor", []);
    } catch (error) {
        if (error instanceof RouterError) {
            run = error.run;
        } else {
            throw error;
        }
    }
    const failures = `${run.stdout}\n${run.stderr}`
        .split("\n")
        .filter((line) => /fail/i.test(line) && /codex/i.test(line));
    if (run.status !== 0 || failures.length > 0) {
        refuse(
            `Codex Router doctor reports the Codex integration is not healthy:${failures.length ? `\n${failures.join("\n")}` : ""}\nRun \`model-router codex doctor --fix\` or fix the reported items, then re-run.`,
        );
    }
};

/* ------------------------------------------------------------- smoke */

const runSmoke = (ctx: HarnessContext, model: string) => {
    if (codexDeps.smokeTest) return codexDeps.smokeTest(ctx, model);
    const run = runRouter(ctx, "smoke-test", [model, "--yes", "--json"]);
    printSuccess(`Smoke test passed for ${model}: ${run.stdout.trim()}`);
    printInfo(
        "Check what it cost: polli usage --key polli-harness-codex --days 1",
    );
};

/* ------------------------------------------------------------ reconcile */

/** Rollback mutation: an already-absent provider is fine, real errors are not. */
const rollbackRouter = (
    ctx: HarnessContext,
    command: keyof typeof ROUTER_SCRIPTS,
    args: string[],
) => {
    try {
        runRouterOrMissing(ctx, command, args);
    } catch (error) {
        if (error instanceof ProviderMissing) return;
        throw error;
    }
};

/**
 * A previous `on` died before the commit boundary (credential publication).
 * Roll back ONLY what the tx proves we made, then let the fresh `on` proceed.
 * The credential file is NEVER touched here: a pre-commit transaction did
 * not publish one, so an existing file predates this transaction.
 */
const reconcile = (ctx: HarnessContext, tx: CodexTx) => {
    printInfo(
        `Recovering an interrupted setup from ${tx.started_at} (step: ${tx.step})...`,
    );
    if (tx.step === "committed") {
        // The key was published; only the baseline bookkeeping may be lost.
        if (!loadBaseline(ctx) && tx.pre) {
            saveBaseline(ctx, {
                created_by_us: !tx.pre.exists,
                enabled_at_first_on: tx.pre.enabled,
                models_added_by_us: tx.models_delta,
                first_on_at: tx.started_at,
            });
        }
        clearTx(ctx);
        return;
    }
    const now = readProviderState(ctx);
    if (tx.models_delta.length > 0 && now.exists && now.owned) {
        rollbackRouter(ctx, "curate-models", [
            PROVIDER_ID,
            "--remove",
            tx.models_delta.join(","),
            "--apply",
        ]);
    }
    if (now.exists && now.owned && tx.pre && !tx.pre.exists) {
        rollbackRouter(ctx, "providers", ["generic", "remove", PROVIDER_ID]);
    }
    clearTx(ctx);
};

/* -------------------------------------------------------------- result */

const result = (
    ctx: HarnessContext,
    extra: Partial<HarnessResult> = {},
): HarnessResult => {
    const router = existsSync(join(routerDir(ctx), "package.json"));
    const credential = readTextIfExists(credentialFile(ctx)) !== null;
    const baseline = loadBaseline(ctx);
    return {
        harness: ID,
        label: LABEL,
        configured: baseline !== null && router && credential,
        files: [credentialFile(ctx), manifestPath(ctx), routerDir(ctx)],
        ...extra,
    };
};

/* -------------------------------------------------------------- adapter */

export const codex: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Codex (via Codex Router) to use Pollinations",
    restartHint:
        "Fully quit and reopen Codex so it picks up the router provider.",

    async on(ctx: HarnessContext, options: HarnessOnOptions) {
        return withLock(lockDir(ctx), async () => {
            // Version gates come first: even crash recovery must never drive
            // an unpinned router (finding: pin enforced before ANY router call).
            ensureCodexCli(ctx);
            ensureRouter(ctx);
            ensureDoctor(ctx);

            const pending = loadTx(ctx);
            if (pending) reconcile(ctx, pending);

            const model = options.model ?? DEFAULT_MODEL;
            const models = await codexDeps.fetchModels(model);
            const modelIds = models.map((entry) => entry.id);

            const pre = readProviderState(ctx);
            if (pre.exists && !pre.owned) {
                refuse(
                    `A Codex Router provider "${PROVIDER_ID}" already exists and was not created by polli (no "${OWNERSHIP_MARKER}" marker). Refusing to touch it; remove or rename it yourself.`,
                );
            }

            const tx: CodexTx = {
                step: "intent",
                pre,
                models_delta: [],
                started_at: new Date().toISOString(),
            };
            saveTx(ctx, tx);

            if (!pre.exists) {
                runRouter(ctx, "providers", [
                    "generic",
                    "add",
                    PROVIDER_ID,
                    "--name",
                    PROVIDER_NAME,
                    "--base-url",
                    PROVIDER_BASE_URL,
                    "--adapter",
                    PROVIDER_ADAPTER,
                    "--credential-ref",
                    CREDENTIAL_REF,
                    "--description",
                    OWNERSHIP_MARKER,
                ]);
            }

            tx.step = "minted";
            saveTx(ctx, tx);
            const apiKey = await codexDeps.resolveKey(
                {
                    id: ID,
                    label: LABEL,
                    existingKey:
                        readTextIfExists(credentialFile(ctx))?.trim() ?? null,
                },
                { browser: options.browser },
            );

            // Commit boundary: publish the key into the router's documented
            // credential file using its own protocol (temp file + rename,
            // 0o600), guarded by the shared snapshot so `off` can restore
            // byte-for-byte.
            applyWithSnapshot(ctx, ID, [credentialFile(ctx)], () =>
                writeTextAtomic(
                    credentialFile(ctx),
                    `${apiKey.trim()}\n`,
                    0o600,
                ),
            );
            tx.step = "committed";
            // Record the full intended set NOW: if we die mid-curation, the
            // committed-tx reconcile rebuilds the baseline with this
            // (safe over-approximation: `off` removing uncurated ids is a
            // no-op, the inverse would leak them).
            tx.models_delta = modelIds;
            saveTx(ctx, tx);

            if (!credentialConfigured(ctx)) {
                throw new Error(
                    `The router does not see the credential after it was written to ${credentialFile(ctx)}. The pinned router (${ROUTER_PIN.slice(0, 8)}) stores keys differently than expected - stopping instead of guessing. Please report this.`,
                );
            }

            runRouter(ctx, "providers", ["generic", "enable", PROVIDER_ID]);

            const before = curatedModels(ctx);
            runRouter(ctx, "curate-models", [
                PROVIDER_ID,
                "--models",
                modelIds.join(","),
                "--apply",
            ]);
            const added = modelIds.filter((id) => !before.includes(id));

            const baseline = loadBaseline(ctx);
            if (baseline) {
                baseline.models_added_by_us = [
                    ...new Set([...baseline.models_added_by_us, ...added]),
                ];
                saveBaseline(ctx, baseline);
            } else {
                saveBaseline(ctx, {
                    created_by_us: !pre.exists,
                    enabled_at_first_on: pre.enabled,
                    models_added_by_us: added,
                    first_on_at: tx.started_at,
                });
            }
            clearTx(ctx);

            if (options.smoke) runSmoke(ctx, model);

            return result(ctx, {
                configured: true,
                model,
                state: "configured",
                notes: [
                    `Router provider "${PROVIDER_ID}" enabled with ${modelIds.length} curated models; active model ${model}.`,
                ],
            });
        });
    },

    async off(ctx: HarnessContext) {
        return withLock(lockDir(ctx), async () => {
            // A crash between commit and baseline write must not make off
            // forget what we own: rebuild the baseline from the tx journal.
            const pendingTx = loadTx(ctx);
            if (pendingTx?.step === "committed") reconcile(ctx, pendingTx);
            const baseline = loadBaseline(ctx);
            const router = existsSync(join(routerDir(ctx), "package.json"));

            // The pin policy applies to destructive paths too: never drive a
            // router version we did not verify, even to remove things.
            if (router && !routerPinned(ctx)) {
                refuse(
                    `Codex Router at ${routerDir(ctx)} is not at the supported pin ${ROUTER_PIN} (v${ROUTER_VERSION}). Refusing to run destructive operations against an unknown version.`,
                );
            }

            if (!router) {
                if (
                    baseline ||
                    readTextIfExists(credentialFile(ctx)) !== null
                ) {
                    return result(ctx, {
                        configured: false,
                        outcome: "unchanged",
                        state: "manual-pending",
                        exitCode: 3,
                        notes: [
                            `Codex Router is missing from ${routerDir(ctx)} but polli state remains. Re-run \`polli harness codex on\` to reinstall the router, then \`off\` again.`,
                        ],
                    });
                }
                return result(ctx, {
                    configured: false,
                    outcome: "unchanged",
                    state: "router-missing",
                    exitCode: 4,
                });
            }

            const state = readProviderState(ctx);
            if (state.exists && !state.owned && !baseline?.created_by_us) {
                refuse(
                    `The Codex Router provider "${PROVIDER_ID}" is not owned by polli. Refusing to remove it.`,
                );
            }
            if (!baseline && !state.exists) {
                return result(ctx, {
                    configured: false,
                    outcome: "unchanged",
                    state: "not-configured",
                    exitCode: 4,
                });
            }

            const facts: CodexBaseline = baseline ?? {
                created_by_us: false,
                enabled_at_first_on: true,
                models_added_by_us: [],
                first_on_at: new Date().toISOString(),
            };

            if (state.exists && facts.models_added_by_us.length > 0) {
                rollbackRouter(ctx, "curate-models", [
                    PROVIDER_ID,
                    "--remove",
                    facts.models_added_by_us.join(","),
                    "--apply",
                ]);
            }
            if (
                state.exists &&
                (facts.created_by_us || !facts.enabled_at_first_on)
            ) {
                rollbackRouter(ctx, "providers", [
                    "generic",
                    "disable",
                    PROVIDER_ID,
                ]);
            }

            const outcome = restoreOrStrip(
                ctx,
                ID,
                [credentialFile(ctx)],
                () => {
                    const had = readTextIfExists(credentialFile(ctx)) !== null;
                    removeIfExists(credentialFile(ctx));
                    return had;
                },
            );

            if (facts.created_by_us && state.exists) {
                rollbackRouter(ctx, "providers", [
                    "generic",
                    "remove",
                    PROVIDER_ID,
                ]);
            }

            const after = readProviderState(ctx);
            if (
                credentialConfigured(ctx) ||
                (facts.created_by_us && after.exists)
            ) {
                return result(ctx, {
                    configured: false,
                    outcome,
                    state: "manual-pending",
                    exitCode: 3,
                    notes: [
                        "Some polli-managed entries are still visible to the router. Inspect with `model-router codex providers generic show pollinations --json`.",
                    ],
                });
            }

            await codexDeps.revokeKeys(ID);
            removeIfExists(manifestPath(ctx));
            clearTx(ctx);

            return result(ctx, {
                configured: false,
                outcome: outcome === "unchanged" ? "stripped" : outcome,
                state: "not-configured",
            });
        });
    },

    async status(ctx: HarnessContext) {
        if (!existsSync(join(routerDir(ctx), "package.json"))) {
            return result(ctx, {
                configured: false,
                state: "router-missing",
                exitCode: 2,
            });
        }
        if (!routerPinned(ctx)) {
            return result(ctx, {
                configured: false,
                state: "version-unsupported",
                exitCode: 2,
                notes: [`Supported pin: ${ROUTER_PIN} (v${ROUTER_VERSION}).`],
            });
        }
        if (!commandExists("codex", ctx.env)) {
            return result(ctx, {
                configured: false,
                state: "client-missing",
                exitCode: 2,
            });
        }
        const state = readProviderState(ctx);
        if (!state.exists) {
            return result(ctx, {
                configured: false,
                state: "not-configured",
                exitCode: 4,
            });
        }
        const key = readTextIfExists(credentialFile(ctx))?.trim();
        if (!key) {
            return result(ctx, {
                configured: false,
                state: "key-absent",
                exitCode: 4,
                notes: [
                    `Provider exists but ${credentialFile(ctx)} is missing. Re-run \`polli harness codex on\`.`,
                ],
            });
        }
        const valid = await codexDeps.validateKey(key);
        return result(ctx, {
            configured: valid,
            model: undefined,
            state: valid ? "key-valid" : "key-invalid",
            exitCode: 0,
            notes: valid
                ? [`Provider enabled: ${state.enabled}.`]
                : [
                      "The stored key no longer validates. Re-run `polli harness codex on` to mint a fresh one.",
                  ],
        });
    },
};

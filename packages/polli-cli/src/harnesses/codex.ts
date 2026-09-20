import { existsSync } from "node:fs";
import { join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import {
    commandExists,
    readTextIfExists,
    removeIfExists,
    writeTextAtomic,
} from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import {
    requireCompatibleVersion,
    requireSuccessfulCommand,
} from "./process.js";
import {
    applyWithSnapshot,
    hasSnapshot,
    restoreOrStrip,
} from "./snapshot.js";
import { responseError, verifyHarnessSmoke } from "./smoke.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "codex";
const LABEL = "Codex Router";
const PROVIDER = "pollinations";
const PROVIDER_NAME = "Pollinations.ai";
const MARKER = "Managed by polli harness codex";
const CREDENTIAL_ID = "cred_pollinations_harness_codex";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const MIN_VERSION = "0.6.0";
const NEXT_MAJOR = "1.0.0";

interface RouterLauncher {
    command: string;
    prefix: string[];
}

const routerLauncher = (ctx: HarnessContext): RouterLauncher | null => {
    if (commandExists("codex-router", ctx.env)) {
        return { command: "codex-router", prefix: [] };
    }
    if (process.platform !== "win32") return null;
    const roots = [
        ctx.env.CODEX_ROUTER_INSTALL_DIR?.trim(),
        ctx.env.LOCALAPPDATA?.trim()
            ? join(ctx.env.LOCALAPPDATA, "codex-router")
            : undefined,
        join(ctx.home, ".local", "share", "codex-router"),
    ].filter((root): root is string => Boolean(root));
    const script = roots
        .map((root) => join(root, "codex-router.ps1"))
        .find(existsSync);
    return script
        ? {
              command: "powershell.exe",
              prefix: [
                  "-NoLogo",
                  "-NoProfile",
                  "-ExecutionPolicy",
                  "Bypass",
                  "-File",
                  script,
              ],
          }
        : null;
};

const runRouterCommand = (
    ctx: HarnessContext,
    args: string[],
    timeout?: number,
) => {
    const launcher = routerLauncher(ctx);
    if (!launcher) throw new Error("Codex Router was not found.");
    return requireSuccessfulCommand(
        launcher.command,
        [...launcher.prefix, ...args],
        ctx,
        timeout,
    );
};

const routerStateDir = (ctx: HarnessContext) => {
    const codexHome = ctx.env.CODEX_HOME?.trim() || join(ctx.home, ".codex");
    return (
        ctx.env.MODEL_ROUTER_STATE_DIR?.trim() ||
        ctx.env.CODEX_ROUTER_STATE_DIR?.trim() ||
        ctx.env.KIMI_CODEX_STATE_DIR?.trim() ||
        join(codexHome, "codex-router")
    );
};

const paths = (ctx: HarnessContext) => {
    const state = routerStateDir(ctx);
    return {
        callerSecret: join(state, "caller-secret"),
        credential: join(
            state,
            "generic-provider-credentials",
            `${PROVIDER}.key`,
        ),
        credentialStore:
            ctx.env.MODEL_ROUTER_PROVIDER_CREDENTIAL_STORE?.trim() ||
            join(state, "provider-credentials.json"),
        picker:
            ctx.env.MODEL_ROUTER_MODEL_PICKER_STATE?.trim() ||
            join(state, "model-picker.json"),
        providers:
            ctx.env.MODEL_ROUTER_GENERIC_PROVIDERS?.trim() ||
            join(state, "generic-providers.json"),
        userModels:
            ctx.env.MODEL_ROUTER_USER_MODELS?.trim() ||
            join(state, "user-models.json"),
    };
};

const snapshotFiles = (ctx: HarnessContext) => {
    const files = paths(ctx);
    // The raw key deliberately stays out of Polli's snapshot store.
    return [
        files.providers,
        files.credentialStore,
        files.userModels,
        files.picker,
    ];
};

const resultFiles = (ctx: HarnessContext) => {
    const files = paths(ctx);
    return [...snapshotFiles(ctx), files.credential];
};

const captureMetadata = (ctx: HarnessContext) =>
    Object.fromEntries(
        snapshotFiles(ctx).map((file) => [file, readTextIfExists(file)]),
    );

const restoreMetadata = (
    ctx: HarnessContext,
    metadata: Record<string, string | null>,
    key: string | null,
) => {
    applyWithSnapshot(ctx, ID, snapshotFiles(ctx), () => {
        for (const [file, content] of Object.entries(metadata)) {
            if (content === null) removeIfExists(file);
            else writeTextAtomic(file, content, 0o600);
        }
    });
    const keyFile = paths(ctx).credential;
    if (key === null) removeIfExists(keyFile);
    else writeTextAtomic(keyFile, key, 0o600);
};

const loadObject = (path: string, fallback: Record<string, unknown>) => {
    const text = readTextIfExists(path);
    if (text === null || !text.trim()) return structuredClone(fallback);
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`${path} must contain a JSON object`);
    }
    return parsed as Record<string, unknown>;
};

const saveObject = (path: string, value: unknown) =>
    writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`, 0o600);

const asRecords = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value)
        ? value.filter(
              (entry): entry is Record<string, unknown> =>
                  Boolean(entry) &&
                  typeof entry === "object" &&
                  !Array.isArray(entry),
          )
        : [];

const isOurProvider = (entry: Record<string, unknown>) =>
    entry.id === PROVIDER && entry.description === MARKER;

const isOurModel = (entry: Record<string, unknown>) =>
    entry.provider === PROVIDER && entry.description === MARKER;

const providerSlug = (model: string) => `${PROVIDER}/${model}`;

const gatewaySafe = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9-]+/gu, "-")
        .replace(/-{2,}/gu, "-")
        .replace(/^-|-$/gu, "");

const modelEntry = (model: HarnessModel, priority: number) => {
    const gatewayModel = `${gatewaySafe(PROVIDER)}-${gatewaySafe(model.id)}`;
    return {
        slug: providerSlug(model.id),
        gatewayModel,
        compHash: `${gatewayModel}-user-v1`,
        upstreamModel: model.id,
        provider: PROVIDER,
        listed: true,
        displayName: `${model.id} (Pollinations)`,
        description: MARKER,
        priority,
        defaultEffort: "high",
        reasoningLevels: [
            { effort: "high", description: "Adaptive reasoning" },
        ],
        contextWindow: model.contextWindow,
        autoCompact: Math.max(1, Math.floor(model.contextWindow * 0.84)),
        inputModalities: model.input,
    };
};

const readKey = (ctx: HarnessContext): string | null => {
    const files = paths(ctx);
    const providers = asRecords(
        loadObject(files.providers, { version: 1, providers: [] }).providers,
    );
    const provider = providers.find((entry) => entry.id === PROVIDER);
    if (!provider || !isOurProvider(provider)) return null;
    const key = readTextIfExists(files.credential)?.trim();
    return key || null;
};

const assertNoCollisions = (ctx: HarnessContext) => {
    const files = paths(ctx);
    const providers = asRecords(
        loadObject(files.providers, { version: 1, providers: [] }).providers,
    );
    const provider = providers.find((entry) => entry.id === PROVIDER);
    const providerOwned = Boolean(provider && isOurProvider(provider));
    if (provider && !isOurProvider(provider)) {
        throw new Error(
            `Codex Router already has a user-owned provider named ${PROVIDER}; rename or remove it first.`,
        );
    }

    const models = asRecords(
        loadObject(files.userModels, { version: 1, models: [] }).models,
    );
    if (models.some((entry) => entry.provider === PROVIDER && !isOurModel(entry))) {
        throw new Error(
            `Codex Router already has user-owned ${PROVIDER} model entries; remove them first.`,
        );
    }

    const credentials = asRecords(
        loadObject(files.credentialStore, {
            schemaVersion: 2,
            credentials: [],
        }).credentials,
    );
    const credential = credentials.find((entry) => entry.id === CREDENTIAL_ID);
    if (
        credential &&
        (!providerOwned ||
            credential.providerId !== PROVIDER ||
            credential.providerType !== "generic")
    ) {
        throw new Error(
            `Codex Router credential id ${CREDENTIAL_ID} belongs to another provider.`,
        );
    }
    if (existsSync(files.credential) && !providerOwned) {
        throw new Error(
            `Codex Router already has a user-owned key file for ${PROVIDER}; move or remove it first.`,
        );
    }
};

const writeMetadata = (
    ctx: HarnessContext,
    models: HarnessModel[],
    model: string,
) => {
    const files = paths(ctx);
    const providersDoc = loadObject(files.providers, {
        version: 1,
        providers: [],
    });
    const providers = asRecords(providersDoc.providers).filter(
        (entry) => entry.id !== PROVIDER,
    );
    providers.push({
        id: PROVIDER,
        displayName: PROVIDER_NAME,
        description: MARKER,
        baseUrl: `${BASE_URL}/v1`,
        adapter: "openai-chat",
        headers: {},
        credentialRef: CREDENTIAL_ID,
        allowPrivate: false,
        enabled: true,
    });
    providersDoc.version = 1;
    providersDoc.providers = providers;
    saveObject(files.providers, providersDoc);

    const credentialDoc = loadObject(files.credentialStore, {
        schemaVersion: 2,
        credentials: [],
    });
    const currentCredentials = asRecords(credentialDoc.credentials);
    const previousCredential = currentCredentials.find(
        (entry) => entry.id === CREDENTIAL_ID,
    );
    const credentials = currentCredentials.filter(
        (entry) => entry.id !== CREDENTIAL_ID,
    );
    const now = new Date().toISOString();
    credentials.push({
        id: CREDENTIAL_ID,
        providerId: PROVIDER,
        providerType: "generic",
        kind: "api_key",
        secretRef: {
            type: "provider-file",
            providerId: PROVIDER,
            target: "codex",
        },
        state: "active",
        label: `${PROVIDER_NAME} API key`,
        createdAt:
            typeof previousCredential?.createdAt === "string"
                ? previousCredential.createdAt
                : now,
        updatedAt: now,
    });
    credentialDoc.schemaVersion = 2;
    credentialDoc.credentials = credentials;
    saveObject(files.credentialStore, credentialDoc);

    const modelDoc = loadObject(files.userModels, { version: 1, models: [] });
    const existingModels = asRecords(modelDoc.models).filter(
        (entry) => entry.provider !== PROVIDER,
    );
    const ordered = [
        ...models.filter((entry) => entry.id === model),
        ...models.filter((entry) => entry.id !== model),
    ];
    modelDoc.version = 1;
    modelDoc.models = [
        ...existingModels,
        ...ordered.map((entry, index) => modelEntry(entry, 100 + index)),
    ];
    saveObject(files.userModels, modelDoc);

    const picker = loadObject(files.picker, {
        version: 1,
        hidden: [],
        visible: [],
        seeded: [],
    });
    const slugs = ordered.map((entry) => providerSlug(entry.id));
    const hidden = new Set(
        (Array.isArray(picker.hidden) ? picker.hidden : []).map(String),
    );
    const visible = new Set(
        (Array.isArray(picker.visible) ? picker.visible : []).map(String),
    );
    const seeded = new Set(
        (Array.isArray(picker.seeded) ? picker.seeded : []).map(String),
    );
    for (const slug of slugs) {
        hidden.delete(slug);
        visible.add(slug);
        seeded.add(slug);
    }
    picker.version = 1;
    picker.hidden = [...hidden].sort();
    picker.visible = [...visible].sort();
    picker.seeded = [...seeded].sort();
    saveObject(files.picker, picker);
};

const stripMetadata = (ctx: HarnessContext) => {
    const files = paths(ctx);
    let changed = false;

    const providersDoc = loadObject(files.providers, {
        version: 1,
        providers: [],
    });
    const providers = asRecords(providersDoc.providers);
    const nextProviders = providers.filter((entry) => !isOurProvider(entry));
    if (nextProviders.length !== providers.length) {
        providersDoc.providers = nextProviders;
        saveObject(files.providers, providersDoc);
        changed = true;
    }

    const credentialDoc = loadObject(files.credentialStore, {
        schemaVersion: 2,
        credentials: [],
    });
    const credentials = asRecords(credentialDoc.credentials);
    const nextCredentials = credentials.filter(
        (entry) =>
            !(
                entry.id === CREDENTIAL_ID &&
                entry.providerId === PROVIDER &&
                entry.providerType === "generic"
            ),
    );
    if (nextCredentials.length !== credentials.length) {
        credentialDoc.credentials = nextCredentials;
        saveObject(files.credentialStore, credentialDoc);
        changed = true;
    }

    const modelDoc = loadObject(files.userModels, { version: 1, models: [] });
    const models = asRecords(modelDoc.models);
    const ourSlugs = models.filter(isOurModel).map((entry) => String(entry.slug));
    const nextModels = models.filter((entry) => !isOurModel(entry));
    if (nextModels.length !== models.length) {
        modelDoc.models = nextModels;
        saveObject(files.userModels, modelDoc);
        changed = true;
    }

    const picker = loadObject(files.picker, {
        version: 1,
        hidden: [],
        visible: [],
        seeded: [],
    });
    let pickerChanged = false;
    for (const field of ["hidden", "visible", "seeded"] as const) {
        const values = Array.isArray(picker[field])
            ? picker[field].map(String)
            : [];
        const filtered = values.filter((value) => !ourSlugs.includes(value));
        if (filtered.length !== values.length) {
            picker[field] = filtered;
            pickerChanged = true;
            changed = true;
        }
    }
    if (pickerChanged) saveObject(files.picker, picker);
    return changed;
};

export const configureCodexRouter = (
    ctx: HarnessContext,
    models: HarnessModel[],
    apiKey: string,
    model: string,
) => {
    assertNoCollisions(ctx);
    const keyFile = paths(ctx).credential;
    const previousKey = readTextIfExists(keyFile);
    try {
        applyWithSnapshot(ctx, ID, snapshotFiles(ctx), () => {
            writeMetadata(ctx, models, model);
            writeTextAtomic(keyFile, `${apiKey}\n`, 0o600);
        });
    } catch (error) {
        if (previousKey === null) removeIfExists(keyFile);
        else writeTextAtomic(keyFile, previousKey, 0o600);
        throw error;
    }
    return baseResult(ctx);
};

export const disableCodexRouter = (ctx: HarnessContext): HarnessResult => {
    const ownsCredential =
        hasSnapshot(ctx, ID, snapshotFiles(ctx)) || readKey(ctx) !== null;
    const outcome = restoreOrStrip(ctx, ID, snapshotFiles(ctx), () =>
        stripMetadata(ctx),
    );
    if (ownsCredential) removeIfExists(paths(ctx).credential);
    return { ...baseResult(ctx), configured: false, outcome };
};

const selectedModel = (ctx: HarnessContext) => {
    const models = asRecords(
        loadObject(paths(ctx).userModels, { version: 1, models: [] }).models,
    )
        .filter(isOurModel)
        .sort((left, right) => Number(left.priority) - Number(right.priority));
    const upstream = models[0]?.upstreamModel;
    return typeof upstream === "string" ? upstream : undefined;
};

const baseResult = (ctx: HarnessContext): HarnessResult => {
    const installed = routerLauncher(ctx) !== null;
    const files = paths(ctx);
    const providers = asRecords(
        loadObject(files.providers, { version: 1, providers: [] }).providers,
    );
    const provider = providers.some(isOurProvider);
    const key = readKey(ctx) !== null;
    const model = selectedModel(ctx);
    const ready = existsSync(files.callerSecret);
    const prerequisites = [
        ...(!installed ? ["Install Codex Router"] : []),
        ...(!ready ? ["Run codex-router setup --guided"] : []),
        ...(!provider ? ["Pollinations provider is missing"] : []),
        ...(!key ? ["Pollinations provider key is missing"] : []),
        ...(!model ? ["Pollinations model catalog is missing"] : []),
    ];
    return {
        harness: ID,
        label: LABEL,
        installed,
        ready,
        provider,
        key,
        configured: installed && ready && provider && key && Boolean(model),
        model,
        prerequisites,
        files: resultFiles(ctx),
    };
};

const routerBaseUrl = (ctx: HarnessContext) => {
    const secret = readTextIfExists(paths(ctx).callerSecret)?.trim();
    if (!secret || !/^[A-Za-z0-9_-]{32,}$/u.test(secret)) {
        throw new Error(
            "Codex Router caller capability is missing; run: codex-router doctor --fix",
        );
    }
    const port =
        ctx.env.MODEL_ROUTER_PORT ??
        ctx.env.CODEX_ROUTER_PORT ??
        ctx.env.KIMI_ROUTER_PORT ??
        "4202";
    return `http://127.0.0.1:${port}/_codex-router/${secret}/v1`;
};

const responseText = (payload: Record<string, unknown>) => {
    if (typeof payload.output_text === "string") return payload.output_text;
    const output = Array.isArray(payload.output) ? payload.output : [];
    return output
        .flatMap((item) => {
            if (!item || typeof item !== "object" || !("content" in item)) {
                return [];
            }
            const content = (item as { content?: unknown }).content;
            return Array.isArray(content) ? content : [];
        })
        .filter(
            (part): part is { text: string } =>
                Boolean(part) &&
                typeof part === "object" &&
                "text" in part &&
                typeof (part as { text?: unknown }).text === "string",
        )
        .map((part) => part.text)
        .join("");
};

const postResponses = async (
    ctx: HarnessContext,
    body: Record<string, unknown>,
) => {
    const response = await fetch(`${routerBaseUrl(ctx)}/responses`, {
        method: "POST",
        headers: {
            Authorization: "Bearer polli-harness-codex-smoke",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(await responseError(response));
    return response;
};

const smokeCodexRouter = async (ctx: HarnessContext, model: string) => {
    const routedModel = providerSlug(model);
    const pongResponse = await postResponses(ctx, {
        model: routedModel,
        input: "Reply with exactly one word: pong",
        stream: false,
    });
    const pong = responseText(
        (await pongResponse.json()) as Record<string, unknown>,
    );
    if (pong.trim().toLowerCase() !== "pong") {
        throw new Error("Codex Router smoke check did not return exactly pong.");
    }

    const streamResponse = await postResponses(ctx, {
        model: routedModel,
        input: "Reply with exactly STREAM_OK",
        stream: true,
    });
    const stream = await streamResponse.text();
    if (!stream.includes("STREAM_OK") || !/response\.(?:completed|done)/u.test(stream)) {
        throw new Error("Codex Router streaming check did not complete.");
    }

    const toolResponse = await postResponses(ctx, {
        model: routedModel,
        input: "Call polli_probe exactly once with value set to ok.",
        stream: false,
        tools: [
            {
                type: "function",
                name: "polli_probe",
                description: "Polli harness compatibility probe",
                parameters: {
                    type: "object",
                    properties: { value: { type: "string" } },
                    required: ["value"],
                    additionalProperties: false,
                },
                strict: true,
            },
        ],
        tool_choice: "required",
    });
    const payload = (await toolResponse.json()) as {
        output?: Array<{ type?: string; name?: string; arguments?: string }>;
    };
    const call = payload.output?.find(
        (item) => item.type === "function_call" && item.name === "polli_probe",
    );
    let valid = false;
    try {
        valid = JSON.parse(call?.arguments ?? "{}").value === "ok";
    } catch {
        valid = false;
    }
    if (!valid) throw new Error("Codex Router tool-call check failed.");
};

const refreshRouter = (ctx: HarnessContext) =>
    runRouterCommand(ctx, ["enable"]);

const readRouterVersion = (ctx: HarnessContext) => {
    const version = runRouterCommand(ctx, ["--version"], 10_000);
    return requireCompatibleVersion(
        LABEL,
        version.stdout || version.stderr,
        MIN_VERSION,
        NEXT_MAJOR,
    );
};

export const codex: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Add Pollinations through Codex Router's generic provider",
    restartHint:
        "Fully quit and reopen Codex to reload its routed model catalog.",

    async on(ctx, options) {
        if (!routerLauncher(ctx)) {
            throw new Error(
                "Codex Router was not found. Install it from https://github.com/duolahypercho/codex-router, run codex-router setup --guided, then retry. No login or key was changed.",
            );
        }
        readRouterVersion(ctx);
        if (!existsSync(paths(ctx).callerSecret)) {
            throw new Error(
                "Codex Router is installed but not ready. Run: codex-router setup --guided. Polli stopped before login or key creation.",
            );
        }
        assertNoCollisions(ctx);

        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: readKey(ctx),
                accountPermissions: ["usage"],
            },
            { browser: options.browser },
        );
        const hadSnapshot = hasSnapshot(ctx, ID, snapshotFiles(ctx));
        const previousMetadata = captureMetadata(ctx);
        const previousKey = readTextIfExists(paths(ctx).credential);

        try {
            configureCodexRouter(ctx, models, apiKey, model);
            refreshRouter(ctx);
            const smoke =
                options.smoke === false
                    ? false
                    : await verifyHarnessSmoke(apiKey, model, () =>
                          smokeCodexRouter(ctx, model),
                      );
            return { ...(await codex.status(ctx)), smoke };
        } catch (error) {
            try {
                if (hadSnapshot) {
                    restoreMetadata(ctx, previousMetadata, previousKey);
                } else {
                    disableCodexRouter(ctx);
                }
            } catch (rollbackError) {
                throw new AggregateError(
                    [error, rollbackError],
                    "Codex Router setup failed and its config could not be restored",
                );
            }
            try {
                refreshRouter(ctx);
            } catch {
                // Preserve the original setup error; status explains repair.
            }
            throw error;
        }
    },

    off(ctx) {
        const result = disableCodexRouter(ctx);
        if (result.installed && result.ready) refreshRouter(ctx);
        return result;
    },

    async status(ctx) {
        const result = baseResult(ctx);
        if (result.installed) {
            try {
                result.version = readRouterVersion(ctx);
            } catch (error) {
                return {
                    ...result,
                    configured: false,
                    prerequisites: [
                        ...(result.prerequisites ?? []),
                        error instanceof Error ? error.message : String(error),
                    ],
                };
            }
        }
        if (!result.ready) return result;
        try {
            const response = await fetch(`${routerBaseUrl(ctx)}/health`, {
                signal: AbortSignal.timeout(2_000),
            });
            return {
                ...result,
                ready: response.ok,
                configured: result.configured && response.ok,
                prerequisites: response.ok
                    ? result.prerequisites
                    : [
                          ...(result.prerequisites ?? []),
                          "Codex Router service is not healthy",
                      ],
            };
        } catch {
            return {
                ...result,
                ready: false,
                configured: false,
                prerequisites: [
                    ...(result.prerequisites ?? []),
                    "Codex Router service is not running",
                ],
            };
        }
    },
};

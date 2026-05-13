export const runtimeProviders = [
    "auto",
    "cloudflare-agents",
    "daytona",
    "aws-agentcore",
    "container",
] as const;

export const runtimeKinds = ["worker", "container"] as const;
export const stateBackends = [
    "memory",
    "kv",
    "durable-object",
    "sqlite",
] as const;
export const sourceTypes = ["git", "template", "bundle"] as const;
export const beeSurfaces = ["openai", "web", "discord", "a2a"] as const;
export const billingModes = ["user-pays", "author-pays"] as const;
export const starterTemplates = ["worker", "queen"] as const;

export type RuntimeProvider = (typeof runtimeProviders)[number];
export type RuntimeKind = (typeof runtimeKinds)[number];
export type StateBackend = (typeof stateBackends)[number];
export type BeeSurface = (typeof beeSurfaces)[number];
export type BillingMode = (typeof billingModes)[number];
export type StarterTemplate = (typeof starterTemplates)[number];

export interface BeeManifest {
    name: string;
    source: {
        type: "git" | "template" | "bundle";
        repository?: string;
        ref?: string;
        template?: string;
        uploadId?: string;
    };
    runtime?: {
        kind?: RuntimeKind;
        provider?: RuntimeProvider;
    };
    state?: {
        backend?: StateBackend;
        retentionDays?: number;
    };
    surfaces: BeeSurface[];
    billing: {
        mode: BillingMode;
        clientId?: string;
        dailyPollenLimit?: number;
    };
    env?: Record<string, string>;
}

export interface NormalizedBeeManifest extends BeeManifest {
    runtime: {
        kind: RuntimeKind;
        provider: RuntimeProvider;
    };
    state: {
        backend: StateBackend;
        retentionDays?: number;
    };
}

const containerProviders = new Set<RuntimeProvider>([
    "daytona",
    "aws-agentcore",
    "container",
]);
const placeholderClientIds = new Set(["pk_replace_me", "pk_app_key", "pk_xxx"]);

const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

const requireString = (errors: string[], value: unknown, path: string) => {
    if (typeof value !== "string" || value.trim() === "") {
        errors.push(`${path} must be a non-empty string`);
    }
};

const requireEnum = <T extends string>(
    errors: string[],
    value: unknown,
    allowed: readonly T[],
    path: string,
) => {
    if (!allowed.includes(value as T)) {
        errors.push(`${path} must be one of ${allowed.join(", ")}`);
    }
};

export function normalizeRuntime(runtime: unknown = {}) {
    const value = isObject(runtime) ? runtime : {};
    return {
        ...value,
        kind: (value.kind ?? "worker") as RuntimeKind,
        provider: (value.provider ?? "auto") as RuntimeProvider,
    };
}

export function normalizeState(state: unknown = {}) {
    const value = isObject(state) ? state : {};
    return {
        ...value,
        backend: (value.backend ?? "sqlite") as StateBackend,
    };
}

export function normalizeBeeManifest(
    manifest: BeeManifest,
): NormalizedBeeManifest {
    return {
        ...manifest,
        runtime: normalizeRuntime(manifest.runtime),
        state: normalizeState(manifest.state),
    };
}

export function validateBeeManifest(manifest: unknown) {
    const errors: string[] = [];

    if (!isObject(manifest)) {
        return { valid: false, errors: ["manifest must be an object"] };
    }

    requireString(errors, manifest.name, "name");

    if (!isObject(manifest.source)) {
        errors.push("source must be an object");
    } else {
        requireEnum(errors, manifest.source.type, sourceTypes, "source.type");
        if (manifest.source.type === "git") {
            requireString(
                errors,
                manifest.source.repository,
                "source.repository",
            );
        }
        if (manifest.source.type === "template") {
            requireString(errors, manifest.source.template, "source.template");
        }
        if (manifest.source.type === "bundle") {
            requireString(errors, manifest.source.uploadId, "source.uploadId");
        }
    }

    if (manifest.runtime !== undefined && !isObject(manifest.runtime)) {
        errors.push("runtime must be an object when provided");
    } else {
        const runtime = normalizeRuntime(manifest.runtime);
        requireEnum(errors, runtime.kind, runtimeKinds, "runtime.kind");
        requireEnum(
            errors,
            runtime.provider,
            runtimeProviders,
            "runtime.provider",
        );
        if (
            runtime.kind === "worker" &&
            containerProviders.has(runtime.provider)
        ) {
            errors.push("runtime.provider requires runtime.kind container");
        }
        if (
            runtime.kind === "container" &&
            runtime.provider === "cloudflare-agents"
        ) {
            errors.push("cloudflare-agents requires runtime.kind worker");
        }
    }

    if (manifest.state !== undefined && !isObject(manifest.state)) {
        errors.push("state must be an object when provided");
    } else {
        const state = normalizeState(manifest.state);
        requireEnum(errors, state.backend, stateBackends, "state.backend");
        if (
            state.retentionDays !== undefined &&
            (!Number.isInteger(state.retentionDays) || state.retentionDays < 0)
        ) {
            errors.push("state.retentionDays must be a non-negative integer");
        }
    }

    if (!Array.isArray(manifest.surfaces) || manifest.surfaces.length === 0) {
        errors.push("surfaces must be a non-empty array");
    } else {
        for (const [index, surface] of manifest.surfaces.entries()) {
            requireEnum(errors, surface, beeSurfaces, `surfaces[${index}]`);
        }
    }

    if (!isObject(manifest.billing)) {
        errors.push("billing must be an object");
    } else {
        requireEnum(
            errors,
            manifest.billing.mode,
            billingModes,
            "billing.mode",
        );
        if (
            manifest.billing.mode === "user-pays" &&
            typeof manifest.billing.clientId !== "string"
        ) {
            errors.push("billing.clientId is required for user-pays bees");
        }
        if (
            manifest.billing.mode === "user-pays" &&
            typeof manifest.billing.clientId === "string" &&
            placeholderClientIds.has(manifest.billing.clientId)
        ) {
            errors.push("billing.clientId must be a real App Key");
        }
        if (
            manifest.billing.dailyPollenLimit !== undefined &&
            (typeof manifest.billing.dailyPollenLimit !== "number" ||
                !Number.isFinite(manifest.billing.dailyPollenLimit) ||
                manifest.billing.dailyPollenLimit <= 0)
        ) {
            errors.push("billing.dailyPollenLimit must be positive");
        }
    }

    return { valid: errors.length === 0, errors };
}

export function assertBeeManifest(manifest: unknown): NormalizedBeeManifest {
    const result = validateBeeManifest(manifest);
    if (!result.valid) {
        throw new Error(result.errors.join("; "));
    }
    return normalizeBeeManifest(manifest as BeeManifest);
}

export function createStarterManifest(
    name = "my-bee",
    template: StarterTemplate = "worker",
): BeeManifest {
    if (template === "queen") {
        return {
            name,
            source: {
                type: "template",
                template: "minimal-daytona-container",
            },
            runtime: {
                kind: "container",
            },
            surfaces: ["openai", "web"],
            billing: {
                mode: "author-pays",
            },
        };
    }

    return {
        name,
        source: {
            type: "template",
            template: "minimal-cloudflare-agents",
        },
        surfaces: ["openai", "web"],
        billing: {
            mode: "author-pays",
        },
    };
}

export function createDeploymentId(name: string) {
    return `bee_${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48)}`;
}

export function kindForProvider(provider: RuntimeProvider): RuntimeKind {
    return containerProviders.has(provider) ? "container" : "worker";
}

export function withRuntimeOverride(
    manifest: BeeManifest,
    provider: RuntimeProvider,
): BeeManifest {
    return {
        ...manifest,
        runtime: {
            ...(manifest.runtime ?? {}),
            kind: kindForProvider(provider),
            provider,
        },
    };
}

export function resolveProvider(runtime: NormalizedBeeManifest["runtime"]) {
    if (runtime.provider !== "auto") return runtime.provider;
    return runtime.kind === "container" ? "daytona" : "cloudflare-agents";
}

export function resolveRuntime(runtime: NormalizedBeeManifest["runtime"]) {
    return {
        ...runtime,
        provider: resolveProvider(runtime),
        requestedProvider: runtime.provider,
    };
}

export function routeForSurface(
    baseUrl: string,
    deploymentId: string,
    surface: BeeSurface,
) {
    const root = `${baseUrl.replace(/\/$/, "")}/bees/${deploymentId}`;
    if (surface === "openai") {
        return `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
    }
    if (surface === "a2a") return `${root}/a2a`;
    if (surface === "discord") return `${root}/discord/messages`;
    return `${root}/web/messages`;
}

export function requiredScopes(manifest: NormalizedBeeManifest) {
    const developer = ["bees:read", "bees:write"];
    if (manifest.surfaces.includes("discord")) developer.push("bees:logs");
    const invocation =
        manifest.billing.mode === "user-pays" ? ["generate"] : [];
    return { developer, invocation };
}

export function estimateBilling(
    manifest: NormalizedBeeManifest,
    runtime = resolveRuntime(manifest.runtime),
) {
    const meters = [
        {
            name: "model_tool_calls",
            payer: manifest.billing.mode,
            unit: "existing_pollinations_pricing",
        },
        {
            name: "orchestration_run",
            payer: manifest.billing.mode,
            unit: "per_run",
        },
        {
            name: "state_retention",
            payer: manifest.billing.mode,
            unit: "gb_day_after_included_quota",
        },
    ];

    if (runtime.kind === "container") {
        meters.push(
            {
                name: "runtime_compute",
                payer: manifest.billing.mode,
                unit: "active_minute",
            },
            {
                name: "workspace_storage",
                payer: manifest.billing.mode,
                unit: "gb_day",
            },
        );
    }

    return {
        currency: "pollen",
        mode: manifest.billing.mode,
        dailyPollenLimit: manifest.billing.dailyPollenLimit,
        meters,
    };
}

export function createDryRunDeployment(
    manifest: NormalizedBeeManifest,
    baseUrl = "https://gen.pollinations.ai",
) {
    const id = createDeploymentId(manifest.name);
    const runtime = resolveRuntime(manifest.runtime);
    const now = new Date().toISOString();
    return {
        id,
        modelId: id,
        name: manifest.name,
        status: "dry_run",
        runtime,
        state: manifest.state,
        requiredScopes: requiredScopes(manifest),
        billingEstimate: estimateBilling(manifest, runtime),
        surfaces: manifest.surfaces.map((surface) => ({
            kind: surface,
            url: routeForSurface(baseUrl, id, surface),
        })),
        createdAt: now,
        updatedAt: now,
    };
}

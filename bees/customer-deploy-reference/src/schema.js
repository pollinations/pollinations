const runtimeProviders = new Set([
    "auto",
    "cloudflare-agents",
    "daytona",
    "aws-agentcore",
    "container",
]);

const runtimeKinds = new Set(["worker", "container"]);
const stateBackends = new Set(["memory", "kv", "durable-object", "sqlite"]);
const sourceTypes = new Set(["git", "template", "bundle"]);
const surfaces = new Set(["openai", "web", "discord", "a2a"]);
const billingModes = new Set(["user-pays", "author-pays"]);
const containerProviders = new Set(["daytona", "aws-agentcore", "container"]);
const placeholderClientIds = new Set(["pk_replace_me", "pk_app_key", "pk_xxx"]);

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(errors, value, path) {
    if (typeof value !== "string" || value.trim() === "") {
        errors.push(`${path} must be a non-empty string`);
    }
}

function requireEnum(errors, value, allowed, path) {
    if (!allowed.has(value)) {
        errors.push(`${path} must be one of ${[...allowed].join(", ")}`);
    }
}

export function validateBeeManifest(manifest) {
    const errors = [];

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
            requireEnum(errors, surface, surfaces, `surfaces[${index}]`);
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
            (!Number.isFinite(manifest.billing.dailyPollenLimit) ||
                manifest.billing.dailyPollenLimit <= 0)
        ) {
            errors.push("billing.dailyPollenLimit must be positive");
        }
    }

    return { valid: errors.length === 0, errors };
}

export function assertBeeManifest(manifest) {
    const result = validateBeeManifest(manifest);
    if (!result.valid) {
        const error = new Error(result.errors.join("; "));
        error.errors = result.errors;
        throw error;
    }
    return normalizeBeeManifest(manifest);
}

export function normalizeRuntime(runtime = {}) {
    return {
        ...runtime,
        kind: runtime.kind ?? "worker",
        provider: runtime.provider ?? "auto",
    };
}

export function normalizeState(state = {}) {
    return {
        ...state,
        backend: state.backend ?? "sqlite",
    };
}

export function normalizeBeeManifest(manifest) {
    return {
        ...manifest,
        runtime: normalizeRuntime(manifest.runtime),
        state: normalizeState(manifest.state),
    };
}

export function createStarterManifest(name = "my-bee") {
    return {
        name,
        source: {
            type: "git",
            repository: "https://github.com/your-org/your-bee.git",
            ref: "main",
        },
        surfaces: ["openai"],
        billing: {
            mode: "author-pays",
        },
    };
}

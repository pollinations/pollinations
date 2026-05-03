import { assertBeeManifest, normalizeRuntime } from "./schema.js";

export function createDeploymentId(name) {
    return `bee_${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48)}`;
}

export function resolveProvider(runtime = {}) {
    const normalized = normalizeRuntime(runtime);
    const provider = normalized.provider;
    if (provider !== "auto") return provider;
    if (normalized.kind === "container") return "daytona";
    return "cloudflare-agents";
}

export function resolveRuntime(runtime = {}) {
    const normalized = normalizeRuntime(runtime);
    const requestedProvider = normalized.provider;
    return {
        ...normalized,
        provider: resolveProvider(normalized),
        requestedProvider,
    };
}

export function estimateBilling(
    manifest,
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

export function routeForSurface(baseUrl, deploymentId, surface) {
    const root = `${baseUrl.replace(/\/$/, "")}/bees/${deploymentId}`;
    if (surface === "openai") return `${root}/v1/chat/completions`;
    if (surface === "a2a") return `${root}/a2a`;
    if (surface === "discord") return `${root}/discord/messages`;
    return `${root}/web/messages`;
}

export class DeployStore {
    #deployments = new Map();
    #events = new Map();

    create(manifest, baseUrl = "https://gen.pollinations.ai", options = {}) {
        const normalizedManifest = assertBeeManifest(manifest);
        const now = new Date().toISOString();
        const id = createDeploymentId(normalizedManifest.name);
        const existing = this.#deployments.get(id);
        if (existing && !options.upgrade) {
            const error = new Error("deployment already exists");
            error.code = "deployment_exists";
            error.id = id;
            throw error;
        }

        const runtime = resolveRuntime(normalizedManifest.runtime);
        const deployment = {
            id,
            name: normalizedManifest.name,
            status: "queued",
            runtime,
            state: normalizedManifest.state,
            requiredScopes: requiredScopes(normalizedManifest),
            billingEstimate: estimateBilling(normalizedManifest, runtime),
            surfaces: normalizedManifest.surfaces.map((surface) => ({
                kind: surface,
                url: routeForSurface(baseUrl, id, surface),
            })),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.#deployments.set(id, deployment);
        this.#events.set(id, [
            ...(existing ? (this.#events.get(id) ?? []) : []),
            {
                deploymentId: id,
                type: "build_started",
                message: existing
                    ? `Upgrade queued ${runtime.provider}`
                    : `Queued ${runtime.provider}`,
                createdAt: now,
            },
        ]);
        return deployment;
    }

    get(id) {
        return this.#deployments.get(id);
    }

    list() {
        return [...this.#deployments.values()];
    }

    events(id) {
        return this.#events.get(id) ?? [];
    }

    delete(id) {
        const existed = this.#deployments.delete(id);
        if (existed) {
            this.#events.set(id, [
                ...(this.#events.get(id) ?? []),
                {
                    deploymentId: id,
                    type: "deleted",
                    message: "Deployment deleted",
                    createdAt: new Date().toISOString(),
                },
            ]);
        }
        return existed;
    }
}

export function requiredScopes(manifest) {
    const developer = ["bees:read", "bees:write"];
    if (manifest.surfaces?.includes("discord")) developer.push("bees:logs");
    const invocation =
        manifest.billing?.mode === "user-pays" ? ["generate"] : [];
    return { developer, invocation };
}

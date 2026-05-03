export type BeeRuntimeProvider =
    | "auto"
    | "cloudflare-agents"
    | "daytona"
    | "aws-agentcore"
    | "container";

export type BeeRuntimeKind = "worker" | "container";
export type BeeStateBackend = "memory" | "kv" | "durable-object" | "sqlite";
export type BeeSurface = "openai" | "web" | "discord" | "a2a";

export type BeeDeploymentSource =
    | {
          type: "git";
          repository: string;
          ref?: string;
          packagePath?: string;
      }
    | {
          type: "template";
          template: "musician-booking-reference";
      }
    | {
          type: "bundle";
          uploadId: string;
      };

export type BeeDeploymentRequest = {
    name: string;
    source: BeeDeploymentSource;
    runtime: {
        kind: BeeRuntimeKind;
        provider?: BeeRuntimeProvider;
        region?: string;
    };
    state: {
        backend: BeeStateBackend;
        retentionDays?: number;
    };
    surfaces: BeeSurface[];
    billing: {
        mode: "user-pays" | "author-pays";
        clientId?: string;
        dailyPollenLimit?: number;
    };
    env?: Record<string, string>;
};

export type BeeDeployment = {
    id: string;
    name: string;
    status: "queued" | "building" | "ready" | "failed";
    runtime: BeeDeploymentRequest["runtime"] & {
        provider: Exclude<BeeRuntimeProvider, "auto">;
        requestedProvider: BeeRuntimeProvider;
    };
    state: BeeDeploymentRequest["state"];
    requiredScopes: {
        developer: string[];
        invocation: string[];
    };
    billingEstimate: {
        currency: "pollen";
        mode: BeeDeploymentRequest["billing"]["mode"];
        dailyPollenLimit?: number;
        meters: Array<{
            name: string;
            payer: BeeDeploymentRequest["billing"]["mode"];
            unit: string;
        }>;
    };
    surfaces: Array<{
        kind: BeeSurface;
        url: string;
    }>;
    createdAt: string;
    updatedAt: string;
};

export type BeeDeploymentEvent = {
    deploymentId: string;
    type: "build_started" | "build_log" | "route_ready" | "failed";
    message: string;
    createdAt: string;
};

export function createDeploymentId(name: string): string {
    return `bee_${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48)}`;
}

export function projectDeploymentRoutes(
    request: BeeDeploymentRequest,
    baseUrl: string,
): BeeDeployment["surfaces"] {
    const root = `${baseUrl.replace(/\/$/, "")}/bees/${createDeploymentId(
        request.name,
    )}`;
    return request.surfaces.map((surface) => {
        if (surface === "openai") {
            return { kind: surface, url: `${root}/v1/chat/completions` };
        }
        if (surface === "a2a") {
            return { kind: surface, url: `${root}/.well-known/agent-card.json` };
        }
        if (surface === "discord") {
            return { kind: surface, url: `${root}/discord/messages` };
        }
        return { kind: surface, url: `${root}/web/messages` };
    });
}

export function resolveProvider(
    runtime: BeeDeploymentRequest["runtime"],
): Exclude<BeeRuntimeProvider, "auto"> {
    const provider = runtime.provider ?? "auto";
    if (provider !== "auto") return provider;
    return runtime.kind === "container" ? "daytona" : "cloudflare-agents";
}

export function resolveRuntime(
    runtime: BeeDeploymentRequest["runtime"],
): BeeDeployment["runtime"] {
    return {
        ...runtime,
        provider: resolveProvider(runtime),
        requestedProvider: runtime.provider ?? "auto",
    };
}

export function requiredScopes(request: BeeDeploymentRequest): {
    developer: string[];
    invocation: string[];
} {
    const developer = ["bees:read", "bees:write"];
    if (request.surfaces.includes("discord")) developer.push("bees:logs");
    return {
        developer,
        invocation: request.billing.mode === "user-pays" ? ["generate"] : [],
    };
}

export function estimateBilling(
    request: BeeDeploymentRequest,
    runtime = resolveRuntime(request.runtime),
): BeeDeployment["billingEstimate"] {
    const meters: BeeDeployment["billingEstimate"]["meters"] = [
        {
            name: "model_tool_calls",
            payer: request.billing.mode,
            unit: "existing_pollinations_pricing",
        },
        {
            name: "orchestration_run",
            payer: request.billing.mode,
            unit: "per_run",
        },
        {
            name: "state_retention",
            payer: request.billing.mode,
            unit: "gb_day_after_included_quota",
        },
    ];

    if (runtime.kind === "container") {
        meters.push(
            {
                name: "runtime_compute",
                payer: request.billing.mode,
                unit: "active_minute",
            },
            {
                name: "workspace_storage",
                payer: request.billing.mode,
                unit: "gb_day",
            },
        );
    }

    return {
        currency: "pollen",
        mode: request.billing.mode,
        dailyPollenLimit: request.billing.dailyPollenLimit,
        meters,
    };
}

export function createQueuedDeployment(
    request: BeeDeploymentRequest,
    baseUrl: string,
    now = new Date(),
): BeeDeployment {
    const timestamp = now.toISOString();
    const runtime = resolveRuntime(request.runtime);
    return {
        id: createDeploymentId(request.name),
        name: request.name,
        status: "queued",
        runtime,
        state: request.state,
        requiredScopes: requiredScopes(request),
        billingEstimate: estimateBilling(request, runtime),
        surfaces: projectDeploymentRoutes(request, baseUrl),
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

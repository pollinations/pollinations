import {
    type BeeDeployment,
    type BeeDeploymentEvent,
    type BeeDeploymentRequest,
    createDeploymentId,
    createQueuedDeployment,
    estimateBilling,
    normalizeState,
    projectDeploymentRoutes,
    requiredScopes,
    resolveRuntime,
} from "./schema.js";

export type BeeDeployApiStore = {
    create(
        request: BeeDeploymentRequest,
        baseUrl: string,
    ): Promise<BeeDeployment>;
    get(id: string): Promise<BeeDeployment | undefined>;
    list(): Promise<BeeDeployment[]>;
    listEvents(id: string): Promise<BeeDeploymentEvent[]>;
    patch(
        id: string,
        patch: Partial<
            Pick<
                BeeDeploymentRequest,
                "billing" | "env" | "runtime" | "state" | "surfaces"
            >
        >,
    ): Promise<BeeDeployment | undefined>;
    delete(id: string): Promise<boolean>;
};

export class MemoryBeeDeployApiStore implements BeeDeployApiStore {
    private deployments = new Map<string, BeeDeployment>();
    private events = new Map<string, BeeDeploymentEvent[]>();

    async create(
        request: BeeDeploymentRequest,
        baseUrl: string,
    ): Promise<BeeDeployment> {
        const deployment = createQueuedDeployment(request, baseUrl);
        this.deployments.set(deployment.id, deployment);
        this.events.set(deployment.id, [
            {
                deploymentId: deployment.id,
                type: "build_started",
                message: "Deployment queued",
                createdAt: deployment.createdAt,
            },
        ]);
        return deployment;
    }

    async get(id: string): Promise<BeeDeployment | undefined> {
        return this.deployments.get(id);
    }

    async list(): Promise<BeeDeployment[]> {
        return [...this.deployments.values()];
    }

    async listEvents(id: string): Promise<BeeDeploymentEvent[]> {
        return this.events.get(id) ?? [];
    }

    async patch(
        id: string,
        patch: Partial<
            Pick<
                BeeDeploymentRequest,
                "billing" | "env" | "runtime" | "state" | "surfaces"
            >
        >,
    ): Promise<BeeDeployment | undefined> {
        const deployment = this.deployments.get(id);
        if (!deployment) return undefined;
        const runtimeRequest = patch.runtime ?? {
            kind: deployment.runtime.kind,
            provider: deployment.runtime.requestedProvider,
            region: deployment.runtime.region,
        };
        const state = normalizeState(patch.state ?? deployment.state);
        const surfaces =
            patch.surfaces ??
            deployment.surfaces.map((surface) => surface.kind);
        const billing = patch.billing ?? {
            mode: deployment.billingEstimate.mode,
            dailyPollenLimit: deployment.billingEstimate.dailyPollenLimit,
        };
        const requestForProjection: BeeDeploymentRequest = {
            name: deployment.name,
            source: {
                type: "template",
                template: "musician-booking-reference",
            },
            runtime: runtimeRequest,
            state,
            surfaces,
            billing,
        };
        const runtime = resolveRuntime(runtimeRequest);
        const baseUrl =
            deployment.surfaces.length > 0
                ? new URL(deployment.surfaces[0].url).origin
                : "https://gen.pollinations.ai";
        const updated: BeeDeployment = {
            ...deployment,
            runtime,
            state,
            requiredScopes: requiredScopes(requestForProjection),
            billingEstimate: estimateBilling(requestForProjection, runtime),
            surfaces: patch.surfaces
                ? projectDeploymentRoutes(requestForProjection, baseUrl)
                : deployment.surfaces,
            updatedAt: new Date().toISOString(),
        };
        this.deployments.set(id, updated);
        this.events.set(id, [
            ...(this.events.get(id) ?? []),
            {
                deploymentId: id,
                type: "build_log",
                message: `Updated ${Object.keys(patch).join(", ")}`,
                createdAt: updated.updatedAt,
            },
        ]);
        return updated;
    }

    async delete(id: string): Promise<boolean> {
        const existed = this.deployments.delete(id);
        if (existed) {
            this.events.set(id, [
                ...(this.events.get(id) ?? []),
                {
                    deploymentId: id,
                    type: "build_log",
                    message: "Deployment disabled",
                    createdAt: new Date().toISOString(),
                },
            ]);
        }
        return existed;
    }
}

function json(data: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), { ...init, headers });
}

async function readJson<T>(request: Request): Promise<T> {
    try {
        return (await request.json()) as T;
    } catch {
        throw new Response("Invalid JSON", { status: 400 });
    }
}

function deploymentIdFromPath(pathname: string): {
    id?: string;
    events: boolean;
} {
    const [, api, bees, id, tail] = pathname.split("/");
    if (api !== "api" || bees !== "bees") return { events: false };
    return { id, events: tail === "events" };
}

export async function handleBeeDeployApiRequest(
    request: Request,
    options: {
        store?: BeeDeployApiStore;
        baseUrl?: string;
    } = {},
): Promise<Response> {
    const store = options.store ?? new MemoryBeeDeployApiStore();
    const url = new URL(request.url);
    const baseUrl = options.baseUrl ?? url.origin;
    const { id, events } = deploymentIdFromPath(url.pathname);

    try {
        if (request.method === "POST" && url.pathname === "/api/bees") {
            const body = await readJson<BeeDeploymentRequest>(request);
            return json(await store.create(body, baseUrl), { status: 202 });
        }

        if (request.method === "GET" && url.pathname === "/api/bees") {
            return json(await store.list());
        }

        if (request.method === "GET" && id && events) {
            return json(await store.listEvents(id));
        }

        if (request.method === "GET" && id) {
            const deployment = await store.get(id);
            return deployment
                ? json(deployment)
                : json({ error: "Not found" }, { status: 404 });
        }

        if (request.method === "PATCH" && id) {
            const deployment = await store.patch(
                id,
                await readJson<
                    Partial<
                        Pick<
                            BeeDeploymentRequest,
                            "billing" | "env" | "runtime" | "state" | "surfaces"
                        >
                    >
                >(request),
            );
            return deployment
                ? json(deployment)
                : json({ error: "Not found" }, { status: 404 });
        }

        if (request.method === "DELETE" && id) {
            return (await store.delete(id))
                ? new Response(null, { status: 204 })
                : json({ error: "Not found" }, { status: 404 });
        }
    } catch (error) {
        if (error instanceof Response) return error;
        return json({ error: "Internal error" }, { status: 500 });
    }

    return json({ error: "Not found" }, { status: 404 });
}

export function deploymentPathForName(name: string): string {
    return `/api/bees/${createDeploymentId(name)}`;
}

// HTTP handler for the deploy control plane. Pure Request → Response so it
// mounts on Workers, Bun, Deno, or Node-via-Hono unchanged.
//
// Auth: every request must carry a Bearer sk_* developer key. We don't
// validate the key against a real registry here (that's the platform's job)
// — we just enforce the *shape* so the surface refuses obvious mistakes.
//
// Routes:
//   POST   /v1/bees                  → create
//   POST   /v1/bees?upgrade=1        → create-or-update
//   GET    /v1/bees                  → list
//   GET    /v1/bees/{id}             → get
//   PATCH  /v1/bees/{id}             → update (re-deploy)
//   DELETE /v1/bees/{id}             → soft-delete
//   GET    /v1/bees/{id}/events      → events (oldest-first)
//   GET    /v1/bees/{id}/events?since=ISO  → events filtered
//   POST   /v1/bees/{id}/transitions → admin: force a status transition
//                                      (used by the builder; would be
//                                      private in production)

import { estimateBilling, requiredScopes } from "./billing.ts";
import type { DeployManifest } from "./manifest-deploy.ts";
import {
    type Deployment,
    type DeploymentStatus,
    DeployStore,
    IdempotencyConflictError,
    InvalidTransitionError,
    NotFoundError,
} from "./store.ts";

export type RoutesOptions = {
    store?: DeployStore;
    baseUrl?: string;
};

function decorateDeployment(d: Deployment) {
    return {
        ...d,
        billingEstimate: estimateBilling(d.manifest),
        requiredScopes: requiredScopes(d.manifest),
    };
}

function jsonError(
    status: number,
    error: string,
    extra: object = {},
): Response {
    return Response.json({ error, ...extra }, { status });
}

function requireBearer(req: Request): string | Response {
    const auth = req.headers.get("authorization");
    if (!auth) return jsonError(401, "missing Authorization header");
    if (!auth.startsWith("Bearer ")) {
        return jsonError(401, "Authorization must be Bearer <token>");
    }
    const token = auth.slice("Bearer ".length).trim();
    if (!token.startsWith("sk_")) {
        return jsonError(
            401,
            "deploy API requires a sk_ developer key (pk_ keys are for invocation, not management)",
        );
    }
    return token;
}

export function makeDeployRoutes(opts: RoutesOptions = {}) {
    const store = opts.store ?? new DeployStore();
    const baseUrl = opts.baseUrl ?? "https://gen.pollinations.ai";

    return {
        store,
        async fetch(req: Request): Promise<Response> {
            const authResult = requireBearer(req);
            if (authResult instanceof Response) return authResult;

            const url = new URL(req.url);
            const path = url.pathname;

            // /v1/bees (no id)
            if (path === "/v1/bees") {
                if (req.method === "GET") {
                    return Response.json({
                        items: store.list().map(decorateDeployment),
                    });
                }
                if (req.method === "POST") {
                    const body = await safeJson(req);
                    if (!body.ok) return body.response;
                    const upgrade = url.searchParams.get("upgrade") === "1";
                    try {
                        const dep = store.create(body.value as DeployManifest, {
                            baseUrl,
                            upgrade,
                        });
                        return Response.json(decorateDeployment(dep), {
                            status: upgrade ? 200 : 201,
                            headers: { location: `/v1/bees/${dep.id}` },
                        });
                    } catch (err) {
                        return mapError(err);
                    }
                }
                return jsonError(405, `${req.method} /v1/bees not allowed`);
            }

            // /v1/bees/{id}/...
            const match = path.match(/^\/v1\/bees\/([^/]+)(\/[^?]*)?$/);
            if (!match) return jsonError(404, "no route");
            const [, id, sub] = match;

            if (sub === "/events" || sub === "/events/") {
                if (req.method !== "GET")
                    return jsonError(405, `${req.method} not allowed`);
                if (!store.get(id))
                    return jsonError(404, `bee ${id} not found`);
                const since = url.searchParams.get("since") ?? undefined;
                return Response.json({
                    items: store.events(id, since ? { since } : {}),
                });
            }

            if (sub === "/transitions" || sub === "/transitions/") {
                if (req.method !== "POST")
                    return jsonError(405, `${req.method} not allowed`);
                const body = await safeJson(req);
                if (!body.ok) return body.response;
                const v = body.value as {
                    to?: DeploymentStatus;
                    message?: string;
                    lastError?: string;
                };
                if (!v.to) return jsonError(400, "to is required");
                try {
                    const dep = store.transition(id, v.to, {
                        message: v.message,
                        lastError: v.lastError,
                    });
                    return Response.json(decorateDeployment(dep));
                } catch (err) {
                    return mapError(err);
                }
            }

            // /v1/bees/{id} — verb dispatch
            if (sub && sub !== "/") return jsonError(404, "no route");

            if (req.method === "GET") {
                const dep = store.get(id);
                if (!dep) return jsonError(404, `bee ${id} not found`);
                return Response.json(decorateDeployment(dep));
            }

            if (req.method === "PATCH") {
                const body = await safeJson(req);
                if (!body.ok) return body.response;
                try {
                    const dep = store.update(
                        id,
                        body.value as Partial<DeployManifest>,
                    );
                    return Response.json(decorateDeployment(dep));
                } catch (err) {
                    return mapError(err);
                }
            }

            if (req.method === "DELETE") {
                const ok = store.delete(id);
                if (!ok) return jsonError(404, `bee ${id} not found`);
                return new Response(null, { status: 204 });
            }

            return jsonError(405, `${req.method} not allowed`);
        },
    };
}

async function safeJson(
    req: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
    try {
        return { ok: true, value: await req.json() };
    } catch {
        return { ok: false, response: jsonError(400, "invalid JSON body") };
    }
}

function mapError(err: unknown): Response {
    if (err instanceof IdempotencyConflictError) {
        return jsonError(409, "deployment already exists", { id: err.id });
    }
    if (err instanceof InvalidTransitionError) {
        return jsonError(409, "invalid status transition", {
            id: err.id,
            from: err.from,
            to: err.to,
        });
    }
    if (err instanceof NotFoundError) {
        return jsonError(404, "deployment not found", { id: err.id });
    }
    if (err instanceof Error) {
        const errors = (err as Error & { errors?: string[] }).errors;
        if (errors) {
            return jsonError(400, "invalid manifest", { errors });
        }
        return jsonError(500, err.message);
    }
    return jsonError(500, String(err));
}

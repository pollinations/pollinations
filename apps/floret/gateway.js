import { authenticateRun } from "./shell-bridge.js";

function catalog(env) {
    return env.FLORET_CATALOG.getByName("global");
}

export async function catalogOutbound(request, env) {
    if (
        request.method !== "GET" ||
        new URL(request.url).pathname !== "/snapshot"
    ) {
        return new Response("Not found", { status: 404 });
    }
    const authority = catalog(env);
    let snapshot = await authority.snapshot();
    if (!snapshot) {
        await authority.refresh();
        snapshot = await authority.snapshot();
    }
    if (!snapshot) return new Response("Catalog unavailable", { status: 503 });
    return Response.json({
        version: snapshot.version,
        catalog: snapshot.catalog,
        review: snapshot.review,
    });
}

export function createGateway(getAgent, fetchImpl = globalThis.fetch) {
    return async function fetch(request, env) {
        const path = new URL(request.url).pathname;
        if (path.startsWith("/_internal/") || path === "/run") {
            return new Response("Not found", { status: 404 });
        }
        const isChat =
            path === "/v1/chat/completions" && request.method === "POST";
        if (isChat && !(await authenticateRun(request, fetchImpl))) {
            return Response.json(
                { detail: "Invalid agent run token." },
                {
                    status: 401,
                    headers: {
                        "Access-Control-Allow-Origin": "*",
                        "Cache-Control": "no-store",
                    },
                },
            );
        }
        return getAgent(env).fetch(request);
    };
}

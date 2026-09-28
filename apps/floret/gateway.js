const AUTH_URL = "https://enter.pollinations.ai/api/account/key";
const AUTH_TIMEOUT_MS = 10_000;
const AUTH_MAX_BYTES = 16 * 1024;

function token(request) {
    const match = /^Bearer\s+(ag_\S+)$/i.exec(
        (request.headers.get("Authorization") || "").trim(),
    );
    return match?.[1] || null;
}

async function boundedJson(response) {
    const length = Number(response.headers.get("Content-Length"));
    if (Number.isFinite(length) && length > AUTH_MAX_BYTES) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks = [];
    let bytes = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > AUTH_MAX_BYTES) return null;
            chunks.push(value);
        }
        const body = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return JSON.parse(new TextDecoder().decode(body));
    } catch {
        return null;
    } finally {
        await reader.cancel().catch(() => {});
    }
}

async function authenticateRun(request, fetchImpl) {
    const bearer = token(request);
    if (!bearer) return false;
    let response;
    try {
        response = await fetchImpl(AUTH_URL, {
            method: "GET",
            headers: { Authorization: `Bearer ${bearer}` },
            redirect: "manual",
            signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
        });
    } catch {
        return false;
    }
    if (response.status !== 200) return false;
    const body = await boundedJson(response);
    return body !== null && body.valid === true;
}

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

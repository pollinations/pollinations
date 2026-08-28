import { createPollinationsAuth } from "@pollinations/auth";

const READ_PIPES = new Set([
    "economics_bank_ledger_api",
    "economics_compute_ledger_api",
    "economics_pollen_usage_api",
    "economics_private_config_api",
]);
const POLLEN_PIPE_ROUTE = "economics_pollen_usage_api";
const POLLEN_UPSTREAM_PIPES = new Set([
    "economics_pollen_usage_api",
    "economics_pollen_usage_snapshot_api",
]);

interface Env {
    ASSETS: Pick<Fetcher, "fetch">;
    POLLINATIONS_AUTH_ALLOWED_EMAILS: string;
    POLLINATIONS_AUTH_BASE_URL?: string;
    POLLINATIONS_AUTH_SESSION_SECRET: string;
    POLLINATIONS_OAUTH_CLIENT_ID: string;
    TINYBIRD_API: string;
    TINYBIRD_ECONOMICS_READ_TOKEN: string;
    TINYBIRD_POLLEN_PIPE: string;
}

function auth(env: Env) {
    return createPollinationsAuth({
        clientId: env.POLLINATIONS_OAUTH_CLIENT_ID,
        sessionSecret: env.POLLINATIONS_AUTH_SESSION_SECRET,
        allowedEmails: env.POLLINATIONS_AUTH_ALLOWED_EMAILS,
        baseUrl: env.POLLINATIONS_AUTH_BASE_URL,
    });
}

function isLocalDevelopment(url: URL) {
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
}

async function protectedAsset(request: Request, env: Env) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function json(body: unknown, status = 200) {
    return Response.json(body, {
        status,
        headers: { "Cache-Control": "no-store" },
    });
}

function requiredSecrets(env: Env) {
    if (
        !env.TINYBIRD_ECONOMICS_READ_TOKEN ||
        !POLLEN_UPSTREAM_PIPES.has(env.TINYBIRD_POLLEN_PIPE)
    ) {
        throw new Error("Economics secrets unavailable");
    }
}

async function handleApi(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/pipes/") && request.method === "GET") {
        const pipe = decodeURIComponent(
            url.pathname.slice("/api/pipes/".length),
        );
        if (!READ_PIPES.has(pipe)) {
            return json({ error: "Unknown pipe" }, 404);
        }

        const upstreamPipe =
            pipe === POLLEN_PIPE_ROUTE ? env.TINYBIRD_POLLEN_PIPE : pipe;
        const upstream = await fetch(
            `${env.TINYBIRD_API}/v0/pipes/${upstreamPipe}.json`,
            {
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_ECONOMICS_READ_TOKEN}`,
                },
            },
        );
        return new Response(upstream.body, {
            status: upstream.status,
            headers: {
                "Cache-Control": "no-store",
                "Content-Type":
                    upstream.headers.get("Content-Type") || "application/json",
            },
        });
    }

    return json({ error: "Not found" }, 404);
}

async function handleRequest(request: Request, env: Env) {
    const url = new URL(request.url);
    let pollinationsAuth: ReturnType<typeof createPollinationsAuth>;
    try {
        requiredSecrets(env);
        pollinationsAuth = auth(env);
    } catch {
        return json({ error: "Economics configuration unavailable" }, 500);
    }

    if (url.pathname === "/api/health") return json({ ok: true });

    const authResponse = await pollinationsAuth.handle(request);
    if (authResponse) return authResponse;

    if (isLocalDevelopment(url) && !url.pathname.startsWith("/api/")) {
        return protectedAsset(request, env);
    }

    if (!(await pollinationsAuth.getUser(request))) {
        return url.pathname.startsWith("/api/")
            ? json({ error: "Unauthorized" }, 401)
            : pollinationsAuth.signIn(request);
    }

    return url.pathname.startsWith("/api/")
        ? handleApi(request, env)
        : protectedAsset(request, env);
}

export default {
    async fetch(request, env) {
        return handleRequest(request, env);
    },
} satisfies ExportedHandler<Env>;

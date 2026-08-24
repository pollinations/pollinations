const SESSION_COOKIE = "economics_session";
const SESSION_PAYLOAD = "economics";
const SESSION_MAX_AGE_SECONDS = 43_200;
const PASSWORD_CHECK_PAYLOAD = "economics-password-check";
const READ_PIPES = new Set([
    "op_transactions_api",
    "op_cloud_api",
    "op_pollen_api",
    "op_forecast_api",
]);

interface Env {
    ECONOMICS_PASSWORD: string;
    LOGIN_RATE_LIMITER: RateLimit;
    TINYBIRD_API: string;
    TINYBIRD_ECONOMICS_READ_TOKEN: string;
}

const encoder = new TextEncoder();

function json(body: unknown, status = 200) {
    return Response.json(body, {
        status,
        headers: { "Cache-Control": "no-store" },
    });
}

function base64Url(bytes: ArrayBuffer) {
    let binary = "";
    for (const byte of new Uint8Array(bytes)) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
}

function fromBase64Url(value: string) {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(password: string) {
    return crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );
}

async function sign(password: string, payload: string) {
    const signature = await crypto.subtle.sign(
        "HMAC",
        await hmacKey(password),
        encoder.encode(payload),
    );
    return base64Url(signature);
}

async function verify(password: string, payload: string, signature: string) {
    try {
        return await crypto.subtle.verify(
            "HMAC",
            await hmacKey(password),
            fromBase64Url(signature),
            encoder.encode(payload),
        );
    } catch {
        return false;
    }
}

function cookieValue(request: Request, name: string) {
    for (const part of (request.headers.get("Cookie") || "").split(";")) {
        const [key, ...value] = part.trim().split("=");
        if (key === name) return decodeURIComponent(value.join("="));
    }
    return "";
}

async function isAuthenticated(request: Request, password: string) {
    const token = cookieValue(request, SESSION_COOKIE);
    const [payload, expiresAtValue, signature, extra] = token.split(".");
    const expiresAt = Number(expiresAtValue);
    if (
        extra !== undefined ||
        payload !== SESSION_PAYLOAD ||
        !Number.isInteger(expiresAt) ||
        expiresAt <= Math.floor(Date.now() / 1000) ||
        !signature
    ) {
        return false;
    }
    return verify(password, `${payload}.${expiresAt}`, signature);
}

async function validPassword(candidate: string, password: string) {
    const signature = await sign(candidate, PASSWORD_CHECK_PAYLOAD);
    return verify(password, PASSWORD_CHECK_PAYLOAD, signature);
}

function requiredSecrets(env: Env) {
    if (!env.ECONOMICS_PASSWORD || !env.TINYBIRD_ECONOMICS_READ_TOKEN) {
        throw new Error("Economics secrets unavailable");
    }
}

async function handleApi(request: Request, env: Env) {
    try {
        requiredSecrets(env);
    } catch {
        return json({ error: "Economics secrets unavailable" }, 500);
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/auth/session") {
        return json({
            authenticated: await isAuthenticated(
                request,
                env.ECONOMICS_PASSWORD,
            ),
        });
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return new Response(null, {
            status: 204,
            headers: {
                "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
            },
        });
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
        const rateLimit = await env.LOGIN_RATE_LIMITER.limit({
            key: request.headers.get("CF-Connecting-IP") || "unknown",
        });
        if (!rateLimit.success) {
            return json({ error: "Too many login attempts" }, 429);
        }

        let body: { password?: string };
        try {
            body = (await request.json()) as { password?: string };
        } catch {
            return json({ error: "Invalid JSON body" }, 400);
        }

        if (
            !(await validPassword(body.password || "", env.ECONOMICS_PASSWORD))
        ) {
            return json({ error: "Unauthorized" }, 401);
        }

        const expiresAt =
            Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
        const sessionPayload = `${SESSION_PAYLOAD}.${expiresAt}`;
        const signature = await sign(env.ECONOMICS_PASSWORD, sessionPayload);
        return new Response(null, {
            status: 204,
            headers: {
                "Set-Cookie": `${SESSION_COOKIE}=${sessionPayload}.${signature}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
            },
        });
    }

    if (!(await isAuthenticated(request, env.ECONOMICS_PASSWORD))) {
        return json({ error: "Unauthorized" }, 401);
    }

    if (url.pathname.startsWith("/api/pipes/") && request.method === "GET") {
        const pipe = decodeURIComponent(
            url.pathname.slice("/api/pipes/".length),
        );
        if (!READ_PIPES.has(pipe)) {
            return json({ error: "Unknown pipe" }, 404);
        }

        const upstream = await fetch(
            `${env.TINYBIRD_API}/v0/pipes/${pipe}.json`,
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

export default {
    async fetch(request, env) {
        return handleApi(request, env);
    },
} satisfies ExportedHandler<Env>;

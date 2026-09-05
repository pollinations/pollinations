const SESSION_COOKIE = "economics_session";
const SESSION_PAYLOAD = "economics";
const SESSION_MAX_AGE_SECONDS = 43_200;
const PASSWORD_CHECK_PAYLOAD = "economics-password-check";
const READ_PIPES = new Set([
    "economics_bank_ledger_api",
    "economics_compute_ledger_api",
    "economics_pollen_usage_api",
    "economics_private_config_api",
    "economics_revenue_share_api",
    "economics_stripe_sales_api",
    "economics_user_balances_api",
]);
const POLLEN_PIPE_ROUTE = "economics_pollen_usage_api";
const POLLEN_UPSTREAM_PIPES = new Set([
    "economics_pollen_usage_api",
    "economics_pollen_usage_snapshot_api",
]);

interface Env {
    ASSETS: Pick<Fetcher, "fetch">;
    ECONOMICS_PASSWORD: string;
    LOGIN_RATE_LIMITER: RateLimit;
    TINYBIRD_API: string;
    TINYBIRD_ECONOMICS_READ_TOKEN: string;
    TINYBIRD_POLLEN_PIPE: string;
}

const encoder = new TextEncoder();

const LOGIN_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Economics</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background: #11110f; color: #f2f0ea; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: start center; }
    main { width: min(28rem, calc(100% - 2rem)); margin-top: 6rem; }
    h1 { font-family: Georgia, serif; font-size: 2.5rem; margin: 0 0 1rem; }
    p { color: #b9b5aa; line-height: 1.5; }
    form { display: flex; gap: .75rem; margin-top: 1.5rem; }
    input, button { border: 1px solid #4a463d; border-radius: .75rem; padding: .8rem 1rem; font: inherit; }
    input { min-width: 0; flex: 1; background: #24231f; color: inherit; }
    button { background: #a87500; color: #fff; cursor: pointer; font-weight: 700; }
    #error { color: #ffaaa5; min-height: 1.5rem; }
  </style>
</head>
<body>
  <main>
    <h1>Economics</h1>
    <p>Enter the economics password.</p>
    <form id="login-form">
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required aria-label="Password">
      <button type="submit">Connect</button>
    </form>
    <p id="error" role="alert"></p>
  </main>
  <script>
    const form = document.getElementById("login-form");
    const password = document.getElementById("password");
    const error = document.getElementById("error");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.value }),
      });
      if (response.ok) {
        location.reload();
        return;
      }
      error.textContent = response.status === 429
        ? "Too many login attempts. Try again shortly."
        : "Wrong password.";
      password.select();
    });
  </script>
</body>
</html>`;

function loginPage() {
    return new Response(LOGIN_PAGE, {
        status: 401,
        headers: {
            "Cache-Control": "no-store",
            "Content-Security-Policy":
                "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            "Content-Type": "text/html; charset=utf-8",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        },
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
    if (
        !env.ECONOMICS_PASSWORD ||
        !env.TINYBIRD_ECONOMICS_READ_TOKEN ||
        !POLLEN_UPSTREAM_PIPES.has(env.TINYBIRD_POLLEN_PIPE)
    ) {
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
    if (url.pathname.startsWith("/api/")) {
        return handleApi(request, env);
    }

    try {
        requiredSecrets(env);
    } catch {
        return json({ error: "Economics secrets unavailable" }, 500);
    }

    if (
        !isLocalDevelopment(url) &&
        !(await isAuthenticated(request, env.ECONOMICS_PASSWORD))
    ) {
        return loginPage();
    }
    return protectedAsset(request, env);
}

export default {
    async fetch(request, env) {
        return handleRequest(request, env);
    },
} satisfies ExportedHandler<Env>;

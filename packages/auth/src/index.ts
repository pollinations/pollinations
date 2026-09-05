const DEFAULT_AUTH_BASE_URL = "https://enter.pollinations.ai";
const LOGIN_PATH = "/auth/login";
const CALLBACK_PATH = "/auth/callback";
const LOGOUT_PATH = "/auth/logout";
const SESSION_PATH = "/auth/session";
const FLOW_COOKIE = "pollinations_oauth_flow";
const SESSION_COOKIE = "pollinations_session";
const FLOW_MAX_AGE_SECONDS = 600;
const SESSION_MAX_AGE_SECONDS = 43_200;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type PollinationsUser = {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
    preferred_username?: string;
};

type Userinfo = PollinationsUser & {
    role?: string;
};

type Session = PollinationsUser & {
    aud: string;
    exp: number;
    role: "admin";
};

type Flow = {
    state: string;
    verifier: string;
    returnTo: string;
};

export type PollinationsAuthConfig = {
    clientId: string;
    sessionSecret: string;
    baseUrl?: string;
    fetch?: typeof fetch;
};

function base64Url(bytes: Uint8Array) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
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

function encodeJson(value: unknown) {
    return base64Url(encoder.encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T {
    return JSON.parse(decoder.decode(fromBase64Url(value))) as T;
}

function randomValue() {
    return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function codeChallenge(verifier: string) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(verifier),
    );
    return base64Url(new Uint8Array(digest));
}

function cookieValue(request: Request, name: string) {
    for (const part of (request.headers.get("Cookie") || "").split(";")) {
        const [key, ...value] = part.trim().split("=");
        if (key === name) {
            try {
                return decodeURIComponent(value.join("="));
            } catch {
                return "";
            }
        }
    }
    return "";
}

function requestCookieName(request: Request, name: string) {
    const port = new URL(request.url).port;
    return port ? `${name}_${port}` : name;
}

function cookie(
    request: Request,
    name: string,
    value: string,
    maxAge: number,
    path = "/",
) {
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return `${name}=${encodeURIComponent(value)}; HttpOnly${secure}; SameSite=Lax; Path=${path}; Max-Age=${maxAge}`;
}

function redirect(location: string, cookies: string[] = []) {
    const headers = new Headers({
        Location: location,
        "Cache-Control": "no-store",
    });
    for (const value of cookies) headers.append("Set-Cookie", value);
    return new Response(null, { status: 302, headers });
}

function authError(message: string, status: number, clearCookie: string) {
    return new Response(message, {
        status,
        headers: {
            "Cache-Control": "no-store",
            "Set-Cookie": clearCookie,
        },
    });
}

function safeReturnTo(value: unknown, origin: string) {
    if (typeof value !== "string") return `${origin}/`;
    try {
        const url = new URL(value, origin);
        return url.origin === origin ? url.toString() : `${origin}/`;
    } catch {
        return `${origin}/`;
    }
}

function normalizeEmail(value: string) {
    return value.trim().toLowerCase();
}

async function hmacKey(secret: string) {
    return crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );
}

export function createPollinationsAuth(config: PollinationsAuthConfig) {
    if (!config.clientId?.startsWith("pk_")) {
        throw new Error("POLLINATIONS_OAUTH_CLIENT_ID must be a pk_ client");
    }
    if (!config.sessionSecret || config.sessionSecret.length < 32) {
        throw new Error(
            "POLLINATIONS_AUTH_SESSION_SECRET must be at least 32 characters",
        );
    }

    const requestFetch = config.fetch ?? fetch;
    const authBaseUrl = new URL(config.baseUrl ?? DEFAULT_AUTH_BASE_URL);
    const authorizeUrl = new URL("/api/auth/oauth2/authorize", authBaseUrl);
    const tokenUrl = new URL("/api/auth/oauth2/token", authBaseUrl).toString();
    const userinfoUrl = new URL(
        "/api/auth/oauth2/userinfo",
        authBaseUrl,
    ).toString();
    const key = hmacKey(config.sessionSecret);

    async function sign(payload: string) {
        const signature = await crypto.subtle.sign(
            "HMAC",
            await key,
            encoder.encode(payload),
        );
        return base64Url(new Uint8Array(signature));
    }

    async function verify(payload: string, signature: string) {
        try {
            return await crypto.subtle.verify(
                "HMAC",
                await key,
                fromBase64Url(signature),
                encoder.encode(payload),
            );
        } catch {
            return false;
        }
    }

    async function startLogin(request: Request) {
        const requestUrl = new URL(request.url);
        const verifier = randomValue();
        const flow: Flow = {
            state: randomValue(),
            verifier,
            returnTo: safeReturnTo(
                requestUrl.searchParams.get("return_to"),
                requestUrl.origin,
            ),
        };
        const redirectUri = `${requestUrl.origin}${CALLBACK_PATH}`;
        const loginUrl = new URL(authorizeUrl);
        loginUrl.searchParams.set("response_type", "code");
        loginUrl.searchParams.set("client_id", config.clientId);
        loginUrl.searchParams.set("redirect_uri", redirectUri);
        loginUrl.searchParams.set("state", flow.state);
        loginUrl.searchParams.set(
            "code_challenge",
            await codeChallenge(verifier),
        );
        loginUrl.searchParams.set("code_challenge_method", "S256");
        loginUrl.searchParams.set("scope", "openid profile email");

        return redirect(loginUrl.toString(), [
            cookie(
                request,
                requestCookieName(request, FLOW_COOKIE),
                encodeJson(flow),
                FLOW_MAX_AGE_SECONDS,
                CALLBACK_PATH,
            ),
        ]);
    }

    async function finishLogin(request: Request) {
        const requestUrl = new URL(request.url);
        const flowCookie = requestCookieName(request, FLOW_COOKIE);
        const clearFlow = cookie(request, flowCookie, "", 0, CALLBACK_PATH);
        const code = requestUrl.searchParams.get("code");
        const state = requestUrl.searchParams.get("state");
        const error = requestUrl.searchParams.get("error");
        const storedFlow = cookieValue(request, flowCookie);
        let flow: Flow;
        try {
            flow = decodeJson<Flow>(storedFlow);
        } catch {
            return authError("Invalid OAuth state", 400, clearFlow);
        }
        if (!state || state !== flow.state || !flow.verifier) {
            return authError("Invalid OAuth state", 400, clearFlow);
        }
        if (error) {
            return authError(
                error === "access_denied"
                    ? "Login cancelled"
                    : "OAuth login failed",
                400,
                clearFlow,
            );
        }
        if (!code) return authError("Invalid OAuth state", 400, clearFlow);

        const redirectUri = `${requestUrl.origin}${CALLBACK_PATH}`;
        const tokenResponse = await requestFetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                client_id: config.clientId,
                redirect_uri: redirectUri,
                code_verifier: flow.verifier,
            }),
        });
        const token = (await tokenResponse.json().catch(() => null)) as {
            access_token?: string;
        } | null;
        if (!tokenResponse.ok || !token?.access_token) {
            return authError("OAuth token exchange failed", 502, clearFlow);
        }

        const userResponse = await requestFetch(userinfoUrl, {
            headers: { Authorization: `Bearer ${token.access_token}` },
        });
        const user = (await userResponse
            .json()
            .catch(() => null)) as Userinfo | null;
        if (
            !userResponse.ok ||
            !user?.sub ||
            !user.email ||
            user.role !== "admin"
        ) {
            return authError("Forbidden", 403, clearFlow);
        }

        const session: Session = {
            ...user,
            email: normalizeEmail(user.email),
            role: "admin",
            aud: requestUrl.origin,
            exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
        };
        const payload = encodeJson(session);
        const sessionCookie = `${payload}.${await sign(payload)}`;
        return redirect(safeReturnTo(flow.returnTo, requestUrl.origin), [
            clearFlow,
            cookie(
                request,
                requestCookieName(request, SESSION_COOKIE),
                sessionCookie,
                SESSION_MAX_AGE_SECONDS,
            ),
        ]);
    }

    async function getUser(request: Request): Promise<PollinationsUser | null> {
        const value = cookieValue(
            request,
            requestCookieName(request, SESSION_COOKIE),
        );
        const [payload, signature, extra] = value.split(".");
        if (
            !payload ||
            !signature ||
            extra ||
            !(await verify(payload, signature))
        ) {
            return null;
        }
        try {
            const session = decodeJson<Session>(payload);
            if (
                !session.sub ||
                !session.email ||
                session.aud !== new URL(request.url).origin ||
                !Number.isInteger(session.exp) ||
                session.exp <= Math.floor(Date.now() / 1000) ||
                session.role !== "admin"
            ) {
                return null;
            }
            const { aud: _aud, exp: _exp, role: _role, ...user } = session;
            return user;
        } catch {
            return null;
        }
    }

    async function handle(request: Request): Promise<Response | null> {
        const url = new URL(request.url);
        if (url.pathname === LOGIN_PATH) return startLogin(request);
        if (url.pathname === CALLBACK_PATH) return finishLogin(request);
        if (url.pathname === SESSION_PATH && request.method === "GET") {
            const user = await getUser(request);
            return Response.json(
                { user },
                {
                    status: user ? 200 : 401,
                    headers: { "Cache-Control": "no-store" },
                },
            );
        }
        if (url.pathname === LOGOUT_PATH) {
            // The protected root would immediately sign the user back in
            // through their separate, still-active Enter session.
            return new Response(
                '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Signed out · Pollinations</title><body><main><h1>Signed out of this dashboard</h1><p>Your Pollinations account and connected apps remain signed in.</p><a href="/auth/login">Sign in again</a></main></body></html>',
                {
                    headers: {
                        "Content-Type": "text/html; charset=utf-8",
                        "Cache-Control": "no-store",
                        "Set-Cookie": cookie(
                            request,
                            requestCookieName(request, SESSION_COOKIE),
                            "",
                            0,
                        ),
                    },
                },
            );
        }
        return null;
    }

    function signIn(request: Request) {
        const url = new URL(request.url);
        const loginUrl = new URL(LOGIN_PATH, url.origin);
        loginUrl.searchParams.set("return_to", `${url.pathname}${url.search}`);
        return redirect(loginUrl.toString());
    }

    return { getUser, handle, signIn };
}

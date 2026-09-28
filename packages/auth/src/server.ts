const DEFAULT_AUTH_BASE_URL = "https://enter.pollinations.ai";
const LOGIN_PATH = "/auth/login";
const CALLBACK_PATH = "/auth/callback";
const LOGOUT_PATH = "/auth/logout";
const SESSION_PATH = "/auth/session";
const FLOW_COOKIE = "pollinations_oauth_flow";
const SESSION_COOKIE = "pollinations_session";
const FLOW_MAX_AGE_SECONDS = 600;
const SESSION_MAX_AGE_SECONDS = 43_200;
const REVALIDATE_SECONDS = 60;

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
    accessToken: string;
    checkedAt: number;
};

// Coalesce a burst of requests carrying the same stale cookie in one Worker.
// Entries exist only while UserInfo is in flight; the signed cookie owns the TTL.
const pendingChecks = new Map<string, Promise<Userinfo | null>>();

export class AuthUnavailableError extends Error {
    constructor() {
        super(
            "Pollinations sign-in is temporarily unavailable. Please try again.",
        );
    }
    getResponse() {
        return Response.json(
            { error: this.message },
            {
                status: 503,
                headers: {
                    "Cache-Control": "private, no-store",
                    "Retry-After": "10",
                },
            },
        );
    }
}

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
    const encryptionKey = crypto.subtle
        .digest(
            "SHA-256",
            encoder.encode(`dashboard-token:${config.sessionSecret}`),
        )
        .then((raw) =>
            crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
                "encrypt",
                "decrypt",
            ]),
        );
    async function encryptToken(token: string, origin: string) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv, additionalData: encoder.encode(origin) },
            await encryptionKey,
            encoder.encode(token),
        );
        return `${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`;
    }
    async function decryptToken(token: string, origin: string) {
        const [iv, ciphertext] = token.split(".");
        return decoder.decode(
            await crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: fromBase64Url(iv),
                    additionalData: encoder.encode(origin),
                },
                await encryptionKey,
                fromBase64Url(ciphertext),
            ),
        );
    }
    async function currentUser(accessToken: string): Promise<Userinfo | null> {
        try {
            const response = await requestFetch(userinfoUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(10_000),
            });
            if (response.status === 401 || response.status === 403) return null;
            if (!response.ok) throw new AuthUnavailableError();
            const user = (await response.json()) as Userinfo;
            if (!user?.sub || !user.email || typeof user.role !== "string")
                throw new AuthUnavailableError();
            return user.role === "admin" ? user : null;
        } catch (error) {
            if (error instanceof AuthUnavailableError) throw error;
            throw new AuthUnavailableError();
        }
    }

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
        function authError(
            message: string,
            status: number,
            clearCookie: string,
        ) {
            const target = new URL("/", requestUrl.origin);
            target.searchParams.set(
                "auth_error",
                status === 403
                    ? "admin_required"
                    : message === "Login cancelled"
                      ? "cancelled"
                      : status === 400
                        ? "invalid_state"
                        : "unavailable",
            );
            return redirect(target.toString(), [clearCookie]);
        }
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
            expires_in?: number;
        } | null;
        if (!tokenResponse.ok || !token?.access_token) {
            return authError("OAuth token exchange failed", 502, clearFlow);
        }

        const user = await currentUser(token.access_token);
        if (!user) return authError("Forbidden", 403, clearFlow);
        const maxAge = Math.min(
            SESSION_MAX_AGE_SECONDS,
            typeof token.expires_in === "number" &&
                Number.isFinite(token.expires_in)
                ? Math.max(0, token.expires_in)
                : SESSION_MAX_AGE_SECONDS,
        );

        const session: Session = {
            ...user,
            email: normalizeEmail(user.email),
            role: "admin",
            aud: requestUrl.origin,
            exp: Math.floor(Date.now() / 1000) + maxAge,
            checkedAt: Math.floor(Date.now() / 1000),
            accessToken: await encryptToken(
                token.access_token,
                requestUrl.origin,
            ),
        };
        const payload = encodeJson(session);
        const sessionCookie = `${payload}.${await sign(payload)}`;
        return redirect(safeReturnTo(flow.returnTo, requestUrl.origin), [
            clearFlow,
            cookie(
                request,
                requestCookieName(request, SESSION_COOKIE),
                sessionCookie,
                maxAge,
            ),
        ]);
    }

    async function getUser(
        request: Request,
        onSessionRefresh?: (value: string) => void,
    ): Promise<PollinationsUser | null> {
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
            const now = Math.floor(Date.now() / 1000);
            if (
                !Number.isInteger(session.checkedAt) ||
                session.checkedAt > now ||
                now - session.checkedAt >= REVALIDATE_SECONDS
            ) {
                const checkKey = `${userinfoUrl}:${value}`;
                let pending = pendingChecks.get(checkKey);
                if (!pending) {
                    pending = (async () =>
                        currentUser(
                            await decryptToken(
                                session.accessToken,
                                session.aud,
                            ),
                        ))().finally(() => pendingChecks.delete(checkKey));
                    pendingChecks.set(checkKey, pending);
                }
                const current = await pending;
                if (!current || current.sub !== session.sub) return null;
                session.email = normalizeEmail(current.email);
                session.name = current.name;
                session.picture = current.picture;
                session.preferred_username = current.preferred_username;
                session.checkedAt = now;
                // Revalidation never extends the original session's lifetime.
                const renewed = encodeJson(session);
                onSessionRefresh?.(
                    cookie(
                        request,
                        requestCookieName(request, SESSION_COOKIE),
                        `${renewed}.${await sign(renewed)}`,
                        session.exp - now,
                    ),
                );
            }
            return {
                sub: session.sub,
                email: normalizeEmail(session.email),
                name: session.name,
                picture: session.picture,
                preferred_username: session.preferred_username,
            };
        } catch (error) {
            if (error instanceof AuthUnavailableError) throw error;
            return null;
        }
    }

    async function handle(request: Request): Promise<Response | null> {
        const url = new URL(request.url);
        if (url.pathname === LOGIN_PATH && request.method === "GET")
            return startLogin(request);
        if (url.pathname === CALLBACK_PATH && request.method === "GET")
            return finishLogin(request).catch(() => {
                const target = new URL("/", url.origin);
                target.searchParams.set("auth_error", "unavailable");
                return redirect(target.toString(), [
                    cookie(
                        request,
                        requestCookieName(request, FLOW_COOKIE),
                        "",
                        0,
                        CALLBACK_PATH,
                    ),
                ]);
            });
        if (url.pathname === SESSION_PATH && request.method === "GET") {
            const headers = new Headers({ "Cache-Control": "no-store" });
            try {
                const user = await getUser(request, (value) =>
                    headers.append("Set-Cookie", value),
                );
                return Response.json(
                    { user },
                    { status: user ? 200 : 401, headers },
                );
            } catch (error) {
                if (error instanceof AuthUnavailableError)
                    return error.getResponse();
                throw error;
            }
        }

        if (url.pathname === LOGOUT_PATH) {
            if (request.method !== "POST")
                return new Response(null, {
                    status: 405,
                    headers: { Allow: "POST" },
                });
            if (request.headers.get("Origin") !== url.origin)
                return new Response(null, { status: 403 });
            const headers = new Headers({ "Cache-Control": "no-store" });
            headers.append(
                "Set-Cookie",
                cookie(
                    request,
                    requestCookieName(request, SESSION_COOKIE),
                    "",
                    0,
                ),
            );
            headers.append(
                "Set-Cookie",
                cookie(
                    request,
                    requestCookieName(request, FLOW_COOKIE),
                    "",
                    0,
                    CALLBACK_PATH,
                ),
            );
            return new Response(null, { status: 204, headers });
        }
        return null;
    }

    return { getUser, handle };
}

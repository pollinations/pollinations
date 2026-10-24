import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { Env, McpProps } from "./types";

const AUTH_STATE_TTL_SECONDS = 10 * 60;
const AUTH_STATE_PREFIX = "pollinations:enter-oauth:";

type PendingAuthorization = {
    request: AuthRequest;
    codeVerifier: string;
};

type EnterTokenResponse = {
    access_token?: string;
    expires_in?: number;
};

function base64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function randomBase64Url(size: number): string {
    return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

async function sha256(value: string): Promise<Uint8Array> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value),
    );
    return new Uint8Array(digest);
}

function callbackUrl(request: Request): string {
    return new URL("/oauth/callback", request.url).toString();
}

function oauthErrorRedirect(
    pending: PendingAuthorization,
    error: string,
): Response {
    const redirect = new URL(pending.request.redirectUri);
    redirect.searchParams.set("error", error);
    if (pending.request.state) {
        redirect.searchParams.set("state", pending.request.state);
    }
    return Response.redirect(redirect.toString(), 302);
}

export async function beginAuthorization(
    request: Request,
    env: Env,
): Promise<Response> {
    if (!env.ENTER_CLIENT_ID?.startsWith("pk_")) {
        return new Response("ENTER_CLIENT_ID is not configured", {
            status: 500,
        });
    }

    const oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    const state = randomBase64Url(24);
    const codeVerifier = randomBase64Url(32);
    const codeChallenge = base64Url(await sha256(codeVerifier));

    const pending: PendingAuthorization = {
        request: oauthRequest,
        codeVerifier,
    };
    await env.OAUTH_KV.put(
        `${AUTH_STATE_PREFIX}${state}`,
        JSON.stringify(pending),
        { expirationTtl: AUTH_STATE_TTL_SECONDS },
    );

    const authorizeUrl = new URL("/authorize", env.ENTER_ORIGIN);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", env.ENTER_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", callbackUrl(request));
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return Response.redirect(authorizeUrl.toString(), 302);
}

export async function finishAuthorization(
    request: Request,
    env: Env,
): Promise<Response> {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    if (!state) return new Response("Missing OAuth state", { status: 400 });

    const stateKey = `${AUTH_STATE_PREFIX}${state}`;
    const pending = await env.OAUTH_KV.get<PendingAuthorization>(stateKey, {
        type: "json",
    });
    if (!pending) {
        return new Response("OAuth state is invalid or expired", {
            status: 400,
        });
    }
    await env.OAUTH_KV.delete(stateKey);

    const upstreamError = url.searchParams.get("error");
    if (upstreamError) return oauthErrorRedirect(pending, upstreamError);

    const code = url.searchParams.get("code");
    if (!code) return oauthErrorRedirect(pending, "invalid_request");

    const tokenResponse = await fetch(
        new URL("/api/oauth/token", env.ENTER_ORIGIN),
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                client_id: env.ENTER_CLIENT_ID,
                redirect_uri: callbackUrl(request),
                code_verifier: pending.codeVerifier,
            }),
        },
    );
    const token = (await tokenResponse
        .json()
        .catch(() => null)) as EnterTokenResponse | null;
    if (!tokenResponse.ok || !token?.access_token?.startsWith("sk_")) {
        return oauthErrorRedirect(pending, "server_error");
    }

    const expiresIn = token.expires_in;
    const props: McpProps = {
        apiKey: token.access_token,
        ...(typeof expiresIn === "number" &&
        Number.isFinite(expiresIn) &&
        expiresIn > 0
            ? { upstreamExpiresIn: expiresIn }
            : {}),
    };
    const userId = `mcp-${base64Url(await sha256(token.access_token))}`;
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: pending.request,
        userId,
        metadata: {},
        scope: [],
        props,
    });

    return Response.redirect(redirectTo, 302);
}

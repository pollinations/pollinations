// BYO Pollen auth: OAuth 2.1 authorization-code + PKCE against
// enter.pollinations.ai (mirrors apps/oauth-client-demo), with a
// paste-an-API-key fallback. The resulting sk_ key lives in tab memory
// only (sessionStorage while the tab is open); it is never written into
// the sandbox.

import { ENTER_URL } from "./piConfig.js";

const VERIFIER_KEY = "pi_oauth_verifier";
const STATE_KEY = "pi_oauth_state";

const KEY_RE = /^sk-[A-Za-z0-9._-]{16,}$/;
const APP_KEY_RE = /^pk-[A-Za-z0-9._-]{8,}$/;

export function randomBase64Url(bytes = 32) {
    const random = crypto.getRandomValues(new Uint8Array(bytes));
    return btoa(String.fromCharCode(...random))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
}

export async function challengeFor(verifier) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
}

export function validateApiKey(key) {
    return typeof key === "string" && KEY_RE.test(key.trim())
        ? key.trim()
        : null;
}

export function validateAppKey(key) {
    return typeof key === "string" && APP_KEY_RE.test(key.trim())
        ? key.trim()
        : null;
}

// Starts the PKCE flow. Returns the authorize URL to navigate to.
export async function startOAuth({
    clientId,
    redirectUri,
    storage = sessionStorage,
}) {
    const verifier = randomBase64Url();
    const state = randomBase64Url(16);
    storage.setItem(VERIFIER_KEY, verifier);
    storage.setItem(STATE_KEY, state);
    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "profile usage",
        state,
        code_challenge: await challengeFor(verifier),
        code_challenge_method: "S256",
    });
    return `${ENTER_URL}/authorize?${params}`;
}

// Handles the ?code&state callback. Returns the access token or null when
// no callback is pending. Throws on state mismatch or exchange failure.
export async function completeOAuth({
    location,
    storage = sessionStorage,
    fetchImpl = fetch,
}) {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const oauthError = params.get("error");
    if (!code && !oauthError) return null;

    const expectedState = storage.getItem(STATE_KEY);
    const verifier = storage.getItem(VERIFIER_KEY);
    storage.removeItem(STATE_KEY);
    storage.removeItem(VERIFIER_KEY);
    history.replaceState({}, "", location.pathname);

    if (oauthError) throw new Error(`Authorization failed: ${oauthError}`);
    if (!expectedState || params.get("state") !== expectedState) {
        throw new Error("OAuth state did not match.");
    }
    if (!verifier) throw new Error("Missing PKCE verifier.");

    const clientId = storage.getItem("pi_oauth_client_id") ?? "";
    const redirectUri = `${location.origin}${location.pathname}`;
    const response = await fetchImpl(`${ENTER_URL}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            redirect_uri: redirectUri,
            code_verifier: verifier,
        }),
    });
    const token = await response.json();
    if (!response.ok || !token.access_token) {
        throw new Error(
            token.error_description ?? token.error ?? "Token exchange failed.",
        );
    }
    return token.access_token;
}

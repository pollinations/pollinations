/**
 * Connect a visitor's Pollinations wallet: OAuth 2.1 code + PKCE against
 * enter.pollinations.ai (static browser apps can do the whole flow, because
 * PKCE replaces the client secret — see BRING_YOUR_OWN_POLLEN.md).
 *
 * The verifier and the resulting key live in sessionStorage only: never in
 * localStorage, the URL, analytics or logs. The gateway bridge reads the key
 * from memory to authorise model calls that leave the sandbox.
 */

export const ENTER_URL = "https://enter.pollinations.ai";
export const GEN_ORIGIN = "https://gen.pollinations.ai";

const TOKEN_KEY = "pi-browser:access_token";
const VERIFIER_KEY = "pi-browser:pkce_verifier";
const STATE_KEY = "pi-browser:oauth_state";

const b64url = (buffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

/**43-character RFC 7636 verifier from 32 random bytes. */
export function createVerifier() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return b64url(bytes);
}

export function createState() {
    return createVerifier();
}

/** base64url(SHA-256(verifier)) — the S256 challenge. */
export async function challengeFor(verifier) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );
    return b64url(digest);
}

/** Where the user comes back to; must match a Redirect URI on the App Key. */
export function redirectUri(location = window.location) {
    return `${location.origin}/`;
}

export function buildAuthorizeUrl({
    clientId,
    redirectUri: redirect,
    state,
    challenge,
    scope = "usage profile",
    budget = 5,
    expiry = 7,
}) {
    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirect,
        scope,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        budget: String(budget),
        expiry: String(expiry),
    });
    return `${ENTER_URL}/authorize?${params}`;
}

/**
 * Start the flow: persist verifier + state, then navigate to the consent
 * screen. Call this from a click handler so the navigation keeps the user
 * gesture.
 */
export async function startConnect({ clientId, scope, budget, expiry }) {
    const verifier = createVerifier();
    const state = createState();
    const challenge = await challengeFor(verifier);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);
    window.location.href = buildAuthorizeUrl({
        clientId,
        redirectUri: redirectUri(),
        state,
        challenge,
        scope,
        budget,
        expiry,
    });
}

/**
 * After the redirect: validate state, swap the code for a key.
 * Returns `{ code, error }`-shaped results so callers can show a message
 * instead of throwing mid-callback.
 */
export async function finishConnect(
    search = window.location.search,
    { clientId, fetchImpl = fetch } = {},
) {
    const params = new URLSearchParams(search);
    const error = params.get("error");
    if (error) {
        return { ok: false, error: params.get("error_description") || error };
    }
    const code = params.get("code");
    if (!code) return { ok: false, error: null };

    const state = params.get("state");
    const expectedState = sessionStorage.getItem(STATE_KEY);
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);
    if (!verifier || !expectedState || state !== expectedState) {
        return { ok: false, error: "OAuth state mismatch, try again." };
    }

    const response = await fetchImpl(`${ENTER_URL}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            redirect_uri: redirectUri(),
            code_verifier: verifier,
        }),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return {
            ok: false,
            error:
                body.error_description ||
                body.error ||
                `token ${response.status}`,
        };
    }
    const { access_token: token } = await response.json();
    saveToken(token);
    // Drop the code from the address bar; the key now lives in sessionStorage.
    window.history.replaceState({}, "", window.location.pathname);
    return { ok: true, token };
}

export function saveToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    return token;
}

export function loadToken() {
    return sessionStorage.getItem(TOKEN_KEY) || null;
}

export function forgetToken() {
    sessionStorage.removeItem(TOKEN_KEY);
}

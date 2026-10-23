const PENDING = "pi-workbench-oauth";
const base64url = (value) =>
    btoa(String.fromCharCode(...value))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
export async function connectWallet(clientId) {
    if (!clientId.startsWith("pk_"))
        throw new Error(
            "This demo needs a registered publishable App Key for wallet authorization.",
        );
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
    const redirect = location.origin + location.pathname;
    const challenge = base64url(
        new Uint8Array(
            await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(verifier),
            ),
        ),
    );
    sessionStorage.setItem(
        PENDING,
        JSON.stringify({ verifier, state, clientId, redirect }),
    );
    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirect,
        scope: "usage",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        budget: "1",
        expiry: "1",
    });
    location.assign(`https://enter.pollinations.ai/authorize?${params}`);
}
export async function finishWallet() {
    const params = new URLSearchParams(location.search);
    if (!params.has("code") && !params.has("error")) return;
    const pending = JSON.parse(sessionStorage.getItem(PENDING) || "null");
    sessionStorage.removeItem(PENDING);
    history.replaceState(null, "", location.pathname);
    if (!pending || pending.state !== params.get("state"))
        throw new Error(
            "Wallet authorization state did not match. Connect again.",
        );
    if (params.has("error"))
        throw new Error("Wallet authorization was cancelled or denied.");
    const response = await fetch(
        "https://enter.pollinations.ai/api/oauth/token",
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code: params.get("code"),
                client_id: pending.clientId,
                redirect_uri: pending.redirect,
                code_verifier: pending.verifier,
            }),
        },
    );
    if (!response.ok)
        throw new Error(
            "Wallet authorization expired or could not be exchanged. Connect again.",
        );
    const result = await response.json();
    if (!result.access_token?.startsWith("sk_"))
        throw new Error("Pollinations returned no usable access token.");
    return result.access_token;
}

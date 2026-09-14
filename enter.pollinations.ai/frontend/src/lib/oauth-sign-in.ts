// Resume the issuer's authorization request after GitHub establishes a session.
// Keep the complete signed query: the issuer validates it and the client callback.
export function oauthSignInCallback(location: string) {
    const url = new URL(location);
    url.pathname = "/api/auth/oauth2/authorize";
    url.hash = "";
    return url.toString();
}

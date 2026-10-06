import { hc } from "hono/client";
import type { ApiRoutes } from "./backend-types.ts";
import { config } from "./config.ts";

export const apiClient = hc<ApiRoutes>(config.apiBaseUrl, {
    init: { credentials: "include" },
});

// Refresh a minute before the server-side expiry so a request never carries a
// token that lapses in flight.
const SESSION_TOKEN_REFRESH_MARGIN_MS = 60_000;

let session: { token: Promise<string>; expiresAt: number } | null = null;

// One mint request at a time: concurrent callers share the pending token.
function sessionToken(): Promise<string> {
    if (session && Date.now() < session.expiresAt) return session.token;
    const current: { token: Promise<string>; expiresAt: number } = {
        token: apiClient["session-token"].$post().then(async (response) => {
            if (!response.ok) {
                throw new Error(`Failed to start session (${response.status})`);
            }
            const { token, expiresIn } = await response.json();
            current.expiresAt =
                Date.now() + expiresIn * 1000 - SESSION_TOKEN_REFRESH_MARGIN_MS;
            return token;
        }),
        expiresAt: Number.POSITIVE_INFINITY,
    };
    current.token.catch(() => {
        if (session === current) session = null;
    });
    session = current;
    return current.token;
}

/**
 * The public account API on gen.pollinations.ai, called with a short-lived
 * token minted from the dashboard session. Apps and agents call the same
 * routes with their API keys. Signed out, requests go without a token and get
 * the API's 401.
 */
export const accountClient = hc<ApiRoutes>(config.genBaseUrl, {
    headers: async (): Promise<Record<string, string>> => {
        const token = await sessionToken().catch(() => null);
        return token ? { Authorization: `Bearer ${token}` } : {};
    },
}).account;

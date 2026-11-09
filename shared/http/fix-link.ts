import type { AgentRunClaims } from "../auth/agent-run-token.ts";
import type { AuthenticatedApiKey } from "../auth/api-key.ts";
import { PUBLIC_URLS } from "../public-urls.ts";

/**
 * Refusals the key's owner can fix. Each one links the enter page that fixes
 * it, and the same link goes into the error message, the JSON `fixUrl` and the
 * chat reply.
 */
export type RefusalContext = {
    env: {
        ENVIRONMENT?: string;
        BETTER_AUTH_SECRET: string;
        BETTER_AUTH_URL?: string;
    };
    var: {
        auth?: {
            apiKey?: AuthenticatedApiKey;
            agentRun?: AgentRunClaims;
            /** The app to return to after the fix. */
            appOrigin?: string;
        };
    };
};

export const AUTHENTICATION_REQUIRED_MESSAGE =
    "A valid API key is required. Get one at https://enter.pollinations.ai/keys, or buy one with USDC (x402) at https://enter.pollinations.ai/api/x402/keys";

/** A link to an enter page on the environment that matches this worker. */
export function fixLink(
    c: RefusalContext,
    path: string,
    params: Record<string, string | undefined>,
): string {
    // Enter links to its own origin; gen picks the enter of its environment.
    // app.request() tests run without env.
    const base =
        c.env?.BETTER_AUTH_URL ??
        (c.env?.ENVIRONMENT === "staging"
            ? PUBLIC_URLS.enter.staging
            : PUBLIC_URLS.enter.production);
    const url = new URL(path, base);
    for (const [key, value] of Object.entries({
        ...params,
        redirect: c.var.auth?.appOrigin,
    })) {
        if (value) url.searchParams.set(key, value);
    }
    return url.toString();
}

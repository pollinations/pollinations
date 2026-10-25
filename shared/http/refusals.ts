import {
    type AgentRunClaims,
    type Grant,
    signGrantAgent,
} from "@shared/auth/agent-run-token.ts";
import type { AuthenticatedApiKey } from "@shared/auth/api-key.ts";
import { PermissionRequiredError } from "@shared/http/permission-required-error.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";

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
            /** Where links that fix a refusal send the owner back to. */
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

export function permissionRequired(
    c: RefusalContext,
    grant: Grant,
    reason: string,
): PermissionRequiredError {
    const id = c.var.auth?.apiKey?.id ?? "";
    // During an agent run, sign the agent's name into the link so the grant
    // page can show who asked without trusting the agent to name itself.
    const agent = c.var.auth?.agentRun?.agentModelId;
    const sig =
        agent &&
        signGrantAgent({
            secret: c.env.BETTER_AUTH_SECRET,
            apiKeyId: id,
            grant,
            agent,
        });
    const fixUrl = fixLink(c, "/grant", {
        id,
        ...grant,
        agent,
        sig,
        ref: "agent_grant",
    });
    return new PermissionRequiredError(
        `${reason} Allow it at ${fixUrl}`,
        fixUrl,
    );
}

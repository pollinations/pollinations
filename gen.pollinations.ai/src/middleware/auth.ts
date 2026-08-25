import type { AgentRunClaims } from "@shared/auth/agent-run-token.ts";
import {
    type AuthenticatedApiKey,
    type AuthUser,
    extractApiKey,
} from "@shared/auth/api-key.ts";
import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import type { BillingIdentity } from "@shared/schemas/billable-event.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { LoggerVariables } from "./logger.ts";

type ModelVariables = {
    model: {
        requested: string;
        resolved: string;
        communityEndpoint?: CommunityEndpointRuntime;
    };
};

export type AuthVariables = {
    auth: {
        user?: AuthUser;
        apiKey?: AuthenticatedApiKey;
        balances?: { tierBalance: number; packBalance: number };
        requireUser: () => AuthUser;
        requireModelAccess: () => void;
        agentRun?: AgentRunClaims;
    };
};

export type GenerationAuthSnapshot = {
    user: Pick<AuthUser, "id" | "tier">;
    apiKey?: Omit<AuthenticatedApiKey, "rawKey">;
    agentRun?: AgentRunClaims;
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & Partial<ModelVariables>;
};

const AUTHENTICATION_REQUIRED_MESSAGE =
    "A valid API key is required. Get one at https://enter.pollinations.ai/keys";

function installAuth(
    c: Context<AuthEnv>,
    authResult: {
        user?: AuthUser;
        apiKey?: AuthenticatedApiKey;
        balances?: { tierBalance: number; packBalance: number };
        agentRun?: AgentRunClaims;
    },
): void {
    const { user, apiKey, balances, agentRun } = authResult;

    const requireUser = (): AuthUser => {
        if (!user) {
            throw new HTTPException(401, {
                message: AUTHENTICATION_REQUIRED_MESSAGE,
            });
        }
        return user;
    };

    function requireModelAccess(): void {
        const model = c.var.model;
        if (!model) return;

        if (!apiKey?.permissions?.models) return;

        if (!apiKey.permissions.models.includes(model.resolved)) {
            throw new HTTPException(403, {
                message: `Model '${model.requested}' is not allowed for this API key`,
            });
        }
    }

    c.set("auth", {
        user,
        apiKey,
        balances,
        requireUser,
        requireModelAccess,
        ...(agentRun && { agentRun }),
    });
}

export const auth = () =>
    createMiddleware<AuthEnv>(async (c, next) => {
        const rawApiKey = extractApiKey(c.req.raw);
        if (!rawApiKey) {
            installAuth(c, {});
            await next();
            return;
        }

        const result = await c.env.ENTER_BILLING.introspect(rawApiKey);
        if (!result.ok) {
            throw new HTTPException(result.error === "forbidden" ? 403 : 401, {
                message:
                    result.error === "forbidden"
                        ? "This account is not allowed to use the API"
                        : AUTHENTICATION_REQUIRED_MESSAGE,
            });
        }
        installAuth(c, authFromBillingIdentity(result.identity, rawApiKey));
        await next();
    });

function authFromBillingIdentity(
    identity: BillingIdentity,
    rawApiKey: string,
): {
    user: AuthUser;
    apiKey: AuthenticatedApiKey;
    balances: { tierBalance: number; packBalance: number };
    agentRun?: AgentRunClaims;
} {
    return {
        user: { id: identity.userId, tier: identity.tier } as AuthUser,
        apiKey: {
            id: identity.apiKey.id,
            name: identity.apiKey.name ?? undefined,
            permissions: identity.apiKey.permissions ?? undefined,
            metadata: {
                ...(identity.apiKey.keyType && {
                    keyType: identity.apiKey.keyType,
                }),
                ...(identity.apiKey.createdVia && {
                    createdVia: identity.apiKey.createdVia,
                }),
            },
            pollenBalance: identity.balances.apiKey,
            byopClientKeyId: identity.apiKey.clientId,
            byopClientName: identity.apiKey.clientName,
            byopClientUserId: identity.apiKey.clientUserId,
            rawKey: rawApiKey,
        },
        balances: {
            tierBalance: identity.balances.tier,
            packBalance: identity.balances.pack,
        },
        agentRun: identity.agentRun,
    };
}

export const authFromSnapshot = (snapshot: GenerationAuthSnapshot) =>
    createMiddleware<AuthEnv>(async (c, next) => {
        installAuth(c, {
            user: snapshot.user as AuthUser,
            apiKey: snapshot.apiKey as AuthenticatedApiKey | undefined,
            agentRun: snapshot.agentRun,
        });
        await next();
    });

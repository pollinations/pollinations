import type { AgentRunClaims } from "@shared/auth/agent-run-token.ts";
import {
    type AuthenticatedApiKey,
    type AuthUser,
    extractApiKey,
} from "@shared/auth/api-key.ts";
import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
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
        agentRun?: AgentRunClaims;
    },
): void {
    const { user, apiKey, agentRun } = authResult;

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
        requireUser,
        requireModelAccess,
        ...(agentRun && { agentRun }),
    });
}

/**
 * Authenticates the caller through Enter's ServiceGateway. Enter owns the
 * credential checks (key validity, bans, staging allowlists, agent run
 * tokens); gen only keeps the raw token in memory for the request so the
 * generation can later be authorized under it. It is never persisted: the
 * durable job snapshot strips it (see createAuthSnapshot).
 */
export const auth = () =>
    createMiddleware<AuthEnv>(async (c, next) => {
        const token = extractApiKey(c.req.raw);
        if (!token) {
            installAuth(c, {});
            return next();
        }
        const introspection = await c.env.ENTER_GATEWAY.introspect(token);
        if (!introspection.valid) {
            // An unknown credential is an anonymous caller (routes decide
            // whether to require a user); a refused one is refused outright.
            if (introspection.denial.status === 401) {
                installAuth(c, {});
                return next();
            }
            throw new HTTPException(introspection.denial.status, {
                message: introspection.denial.message,
            });
        }
        installAuth(c, {
            user: introspection.user as AuthUser,
            apiKey: { ...introspection.apiKey, rawKey: token },
            agentRun: introspection.agentRun,
        });
        await next();
    });

export const authFromSnapshot = (snapshot: GenerationAuthSnapshot) =>
    createMiddleware<AuthEnv>(async (c, next) => {
        installAuth(c, {
            user: snapshot.user as AuthUser,
            apiKey: snapshot.apiKey as AuthenticatedApiKey | undefined,
            agentRun: snapshot.agentRun,
        });
        await next();
    });

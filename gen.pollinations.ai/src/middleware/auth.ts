import type { AgentRunClaims } from "@shared/auth/agent-run-token.ts";
import {
    type AuthenticatedApiKey,
    type AuthUser,
    authenticateApiKeyRequest,
    BannedAccountError,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import { isModelAllowed } from "@shared/registry/registry.ts";
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
        requireAuthorization: (options?: { message?: string }) => Promise<void>;
        requireUser: () => AuthUser;
        requireModelAccess: () => void;
        agentRun?: AgentRunClaims;
    };
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & Partial<ModelVariables>;
};

export const auth = () =>
    createMiddleware<AuthEnv>(async (c, next) => {
        const authResult = await (async () => {
            try {
                return await authenticateApiKeyRequest({
                    request: c.req.raw,
                    env: c.env,
                    ctx: c.executionCtx,
                });
            } catch (error) {
                if (
                    error instanceof BannedAccountError ||
                    error instanceof StagingAccessDeniedError
                ) {
                    throw new HTTPException(403, { message: error.message });
                }
                throw error;
            }
        })();

        const { user, apiKey, agentRun } = authResult || {};

        const requireAuthorization = async (options?: {
            message?: string;
        }): Promise<void> => {
            if (!user) {
                throw new HTTPException(401, {
                    message: options?.message,
                });
            }
        };

        const requireUser = (): AuthUser => {
            if (!user) throw new HTTPException(401);
            return user;
        };

        function requireModelAccess(): void {
            const model = c.var.model;
            if (!model) return;

            if (agentRun && model.communityEndpoint) {
                throw new HTTPException(403, {
                    message: "Agent run tokens cannot call community models",
                });
            }

            if (!apiKey?.permissions?.models) return;

            if (!isModelAllowed(apiKey.permissions.models, model.resolved)) {
                throw new HTTPException(403, {
                    message: `Model '${model.requested}' is not allowed for this API key`,
                });
            }
        }

        c.set("auth", {
            user,
            apiKey,
            requireAuthorization,
            requireUser,
            requireModelAccess,
            ...(agentRun && { agentRun }),
        });

        await next();
    });

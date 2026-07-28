import {
    type AuthenticatedApiKey,
    type AuthUser,
    authenticateApiKeyRequest,
    BannedAccountError,
    extractApiKey,
    loadActiveApiKeyAuthResult,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import {
    AGENT_RUN_TOKEN_PREFIX,
    type AgentRunClaims,
    verifyAgentRunToken,
} from "../utils/agent-run-token.ts";
import type { LoggerVariables } from "./logger.ts";

type ModelVariables = {
    model: {
        requested: string;
        resolved: string;
    };
};

export type AuthVariables = {
    auth: {
        user?: AuthUser;
        apiKey?: AuthenticatedApiKey;
        requireAuthorization: (options?: { message?: string }) => Promise<void>;
        requireUser: () => AuthUser;
        requireModelAccess: () => void;
        agentRun?: Pick<AgentRunClaims, "agentId" | "runId" | "expiresAt">;
    };
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & Partial<ModelVariables>;
};

export const auth = () =>
    createMiddleware<AuthEnv>(async (c, next) => {
        let agentRun: AgentRunClaims | undefined;
        const authResult = await (async () => {
            try {
                const rawApiKey = extractApiKey(c.req.raw);
                if (rawApiKey?.startsWith(AGENT_RUN_TOKEN_PREFIX)) {
                    let claims: AgentRunClaims;
                    try {
                        claims = await verifyAgentRunToken(
                            rawApiKey,
                            c.env.BETTER_AUTH_SECRET,
                        );
                    } catch {
                        return null;
                    }

                    const parent = await loadActiveApiKeyAuthResult({
                        apiKeyId: claims.parentApiKeyId,
                        rawApiKey,
                        env: c.env,
                    });
                    if (!parent) return null;

                    const parentModels = parent.apiKey.permissions?.models;
                    const models = parentModels
                        ? claims.models.filter((model) =>
                              parentModels.includes(model),
                          )
                        : claims.models;
                    agentRun = claims;

                    return {
                        ...parent,
                        apiKey: {
                            ...parent.apiKey,
                            permissions: { models },
                        },
                    };
                }

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

        const { user, apiKey } = authResult || {};

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
            if (!apiKey?.permissions?.models) return;

            const model = c.var.model;
            if (!model) return;

            if (!apiKey.permissions.models.includes(model.resolved)) {
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
            ...(agentRun && {
                agentRun: {
                    agentId: agentRun.agentId,
                    runId: agentRun.runId,
                    expiresAt: agentRun.expiresAt,
                },
            }),
        });

        await next();
    });

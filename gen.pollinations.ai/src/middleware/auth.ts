import {
    type AuthenticatedApiKey,
    type AuthUser,
    authenticateApiKeyRequest,
    BannedAccountError,
} from "@shared/auth/api-key.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
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
        requireKeyBudget: () => void;
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
                if (error instanceof BannedAccountError) {
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

        function requireKeyBudget(): void {
            if (!apiKey) return;

            const { pollenBalance } = apiKey;
            if (pollenBalance === null || pollenBalance === undefined) return;

            if (pollenBalance <= 0) {
                throw new HTTPException(402, {
                    message:
                        "API key budget exhausted. Please top up or create a new key.",
                });
            }
        }

        c.set("auth", {
            user,
            apiKey,
            requireAuthorization,
            requireUser,
            requireModelAccess,
            requireKeyBudget,
        });

        await next();
    });

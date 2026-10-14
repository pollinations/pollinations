import type { AgentRunClaims } from "@shared/auth/agent-run-token.ts";
import {
    type AuthenticatedApiKey,
    assertNotBanned,
    assertStagingAccess,
    authenticateApiKeyRequest,
    BannedAccountError,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Session, User } from "../auth.ts";
import { createAuth } from "../auth.ts";
import type { LoggerVariables } from "./logger.ts";

export type AuthVariables = {
    auth: {
        client: ReturnType<typeof createAuth>;
        user?: User;
        session?: Session;
        apiKey?: AuthenticatedApiKey;
        rawApiKey?: string;
        agentRun?: AgentRunClaims;
        requireAuthorization: (options?: { message?: string }) => Promise<void>;
        requireUser: () => User;
    };
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables;
};

export type AuthOptions = {
    allowSessionCookie: boolean;
    allowApiKey: boolean;
};

interface AuthResult {
    user?: User;
    session?: Session;
    apiKey?: AuthenticatedApiKey;
    rawApiKey?: string;
    agentRun?: AgentRunClaims;
}

export const auth = (options: AuthOptions) =>
    createMiddleware<AuthEnv>(async (c, next) => {
        const client = createAuth(c.env);

        const authenticateSession = async (): Promise<AuthResult | null> => {
            if (!options.allowSessionCookie) return null;
            const result = await client.api.getSession({
                headers: c.req.raw.headers,
            });
            if (!result?.user) return null;

            try {
                assertNotBanned(result.user);
                assertStagingAccess(c.env, result.user);
            } catch (error) {
                if (
                    error instanceof BannedAccountError ||
                    error instanceof StagingAccessDeniedError
                ) {
                    throw new HTTPException(403, { message: error.message });
                }
                throw error;
            }

            return {
                user: result?.user,
                session: result?.session,
            };
        };

        const authenticateApiKey = async (): Promise<AuthResult | null> => {
            if (!options.allowApiKey) return null;
            try {
                const result = await authenticateApiKeyRequest({
                    request: c.req.raw,
                    env: c.env,
                    client,
                    ctx: c.executionCtx,
                });
                if (!result) return null;
                return {
                    user: result.user as User,
                    apiKey: result.apiKey,
                    rawApiKey: result.rawApiKey,
                    agentRun: result.agentRun,
                };
            } catch (error) {
                if (
                    error instanceof BannedAccountError ||
                    error instanceof StagingAccessDeniedError
                ) {
                    throw new HTTPException(403, { message: error.message });
                }
                throw error;
            }
        };

        // Try session authentication first, then API key
        let authResult = await authenticateSession();
        if (!authResult) {
            authResult = await authenticateApiKey();
        }
        const { user, session, apiKey, rawApiKey, agentRun } = authResult || {};

        const requireAuthorization = async (options?: {
            message?: string;
        }): Promise<void> => {
            if (!user) {
                throw new HTTPException(401, {
                    message: options?.message,
                });
            }
        };

        const requireUser = (): User => {
            if (!user) throw new HTTPException(401);
            return user;
        };

        c.set("auth", {
            client,
            user,
            session,
            apiKey,
            rawApiKey,
            agentRun,
            requireAuthorization,
            requireUser,
        });

        await next();
    });

import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth.ts";
import { LoggerVariables } from "./logger.ts";
import type { Session, User, Auth } from "@/auth.ts";
import {
    extractApiKey,
    authenticateSession,
    authenticateApiKey,
    createRequireAuthorization,
    createRequireUser,
    type ApiKey,
    type AuthResult,
} from "./auth-utils.ts";

export type AuthVariables = {
    auth: {
        client: ReturnType<typeof createAuth>;
        user?: User;
        session?: Session;
        apiKey?: ApiKey;
        requireAuthorization: (options?: {
            allowAnonymous: boolean;
            message?: string;
        }) => Promise<void>;
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


export const auth = (options: AuthOptions) =>
    createMiddleware<AuthEnv>(async (c, next) => {
        const log = c.get("log");
        const client = createAuth(c.env) as Auth;

        const tryAuthenticateSession = async (): Promise<AuthResult | null> => {
            if (!options.allowSessionCookie) return null;
            return await authenticateSession(client, c.req.raw.headers, log);
        };

        const tryAuthenticateApiKey = async (): Promise<AuthResult | null> => {
            if (!options.allowApiKey) return null;
            const apiKey = extractApiKey(c);
            if (!apiKey) return null;
            return await authenticateApiKey(client, apiKey, c.env, log);
        };

        const { user, session, apiKey } =
            (await tryAuthenticateSession()) || (await tryAuthenticateApiKey()) || {};

        log.debug("[AUTH] Authentication result: {authenticated}", {
            authenticated: !!user,
            hasSession: !!session,
            hasApiKey: !!apiKey,
            userId: user?.id,
        });

        const requireAuthorization = createRequireAuthorization(user, log);
        const requireUser = createRequireUser(user);

        c.set("auth", {
            client,
            user,
            session,
            apiKey,
            requireAuthorization,
            requireUser,
        });

        await next();
    });

import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth.ts";
import { LoggerVariables } from "./logger.ts";
import { HTTPException } from "hono/http-exception";
import type { Session, User, Auth } from "@/auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema/better-auth.ts";

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

type ApiKey = {
    name?: string;
    permissions?: Record<string, string[]>;
};

type AuthResult = {
    user?: User;
    session?: Session;
    apiKey?: ApiKey;
};

function extractApiKey(headers: Headers): string | null {
    if (headers.has("x-api-key")) {
        return headers.get("x-api-key");
    }
    if (headers.has("authorization")) {
        return headers.get("authorization")!.split(" ")[1] || null;
    }
    return null;
}

export const auth = (options: AuthOptions) =>
    createMiddleware<AuthEnv>(async (c, next) => {
        const client = createAuth(c.env) as Auth;

        const authenticateSession = async (): Promise<AuthResult | null> => {
            if (!options.allowSessionCookie) return null;
            const result = await client.api.getSession({
                headers: c.req.raw.headers,
            });
            if (!result?.user) return null;
            return {
                user: result?.user,
                session: result?.session,
            };
        };

        const authenticateApiKey = async (): Promise<AuthResult | null> => {
            if (!options.allowApiKey) return null;
            const apiKey = extractApiKey(c.req.raw.headers);
            if (!apiKey) return null;
            const keyResult = await client.api.verifyApiKey({
                body: {
                    key: apiKey,
                },
            });
            if (!keyResult.valid || !keyResult.key) return null;
            const db = drizzle(c.env.DB, { schema });
            const user = await db.query.user.findFirst({
                where: eq(schema.user.id, keyResult.key.userId),
            });
            return {
                user: user as User,
                apiKey: {
                    name: keyResult.key.name || undefined,
                    permissions: keyResult.key.permissions || undefined,
                },
            };
        };

        const { user, session, apiKey } =
            (await authenticateSession()) || (await authenticateApiKey()) || {};

        const requireAuthorization = async (options?: {
            allowAnonymous?: boolean;
            message?: string;
        }): Promise<void> => {
            if (!user && !options?.allowAnonymous) {
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
            requireAuthorization,
            requireUser,
        });

        await next();
    });

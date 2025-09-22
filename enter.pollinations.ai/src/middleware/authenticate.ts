import type { Session, User } from "better-auth";
import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth.ts";
import { LoggerVariables } from "./logger.ts";
import { HTTPException } from "hono/http-exception";

export type UserSession = {
    user: User;
    session: Session;
};

export type AuthVariables = {
    auth: {
        client: ReturnType<typeof createAuth>;
        session?: Session;
        user?: User;
        requireActiveSession: (message?: string) => UserSession;
    };
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables;
};

export const authenticate = createMiddleware<AuthEnv>(async (c, next) => {
    const client = createAuth(c.env);

    const result = await client.api.getSession({
        headers: c.req.raw.headers,
    });

    const session = result?.session;
    const user = result?.user;

    const requireActiveSession = (message?: string): UserSession => {
        if (!user || !session) {
            throw new HTTPException(401, {
                message:
                    message || "You need to be signed-in to access this route.",
            });
        }
        return { user, session };
    };

    c.set("auth", {
        client,
        session,
        user,
        requireActiveSession,
    });
    await next();
});

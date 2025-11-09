import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth.ts";
import { LoggerVariables } from "./logger.ts";
import type { Session, User, Auth } from "@/auth.ts";
import {
    authenticateSession,
    createRequireUser,
    type AuthResult,
} from "./auth-utils.ts";

export type AuthVariables = {
    auth: {
        client: ReturnType<typeof createAuth>;
        user?: User;
        session?: Session;
        requireUser: () => User;
    };
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables;
};

export const auth = createMiddleware<AuthEnv>(async (c, next) => {
    const log = c.get("log");
    const client = createAuth(c.env) as Auth;

    const { user, session } = (await authenticateSession(client, c.req.raw.headers, log)) || {};

        log.debug("[AUTH] Authentication result: {authenticated}", {
            authenticated: !!user,
            hasSession: !!session,
            userId: user?.id,
        });

        const requireUser = createRequireUser(user);

        c.set("auth", {
            client,
            user,
            session,
            requireUser,
        });

    await next();
});

import type { Session, User } from "better-auth";
import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth.ts";
import { LoggerVariables } from "./logger.ts";

export type AuthVariables = {
    auth: ReturnType<typeof createAuth>;
    session?: Session;
    user?: User;
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables;
};

export const authenticate = createMiddleware<AuthEnv>(async (c, next) => {
    const auth = createAuth(c.env);
    c.set("auth", auth);

    const result = await auth.api.getSession({
        headers: c.req.raw.headers,
    });

    const session = result?.session;
    const user = result?.user;

    c.set("session", session);
    c.set("user", user);

    await next();
});

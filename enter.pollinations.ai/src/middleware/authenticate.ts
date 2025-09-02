import type { Session, User } from "better-auth";
import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth.ts";

type Env = {
    Bindings: CloudflareBindings;
    Variables: {
        auth: ReturnType<typeof createAuth>;
        session?: Session;
        user?: User;
    };
};

export const authenticate = createMiddleware<Env>(async (c, next) => {
    const auth = createAuth(c.env);
    c.set("auth", auth);

    const result = await auth.api.getSession({
        headers: c.req.raw.headers,
    });

    const session = result?.session;
    const user = result?.user;

    c.set("session", session);
    c.set("user", user);

    return next();
});

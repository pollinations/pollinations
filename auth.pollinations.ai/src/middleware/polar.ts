import { Polar } from "@polar-sh/sdk";
import type { Session, User } from "better-auth";
import { createMiddleware } from "hono/factory";
import type { createAuth } from "../auth.ts";

type Env = {
    Bindings: Cloudflare.Env;
    Variables: {
        auth: ReturnType<typeof createAuth>;
        session?: Session;
        user?: User;
        polar: Polar;
    };
};

export const polar = createMiddleware<Env>(async (c, next) => {
    const polar = new Polar({
        accessToken: c.env.POLAR_ACCESS_TOKEN,
        server: "sandbox",
    });
    c.set("polar", polar);

    return next();
});

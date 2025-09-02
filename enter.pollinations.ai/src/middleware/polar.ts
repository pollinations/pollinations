import { Polar } from "@polar-sh/sdk";
import { createMiddleware } from "hono/factory";

type Env = {
    Bindings: CloudflareBindings;
    Variables: {
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

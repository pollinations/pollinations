import { Polar } from "@polar-sh/sdk";
import { createMiddleware } from "hono/factory";

export type PolarEnv = {
    Bindings: CloudflareBindings;
    Variables: {
        polar: Polar;
    };
};

export const polar = createMiddleware<PolarEnv>(async (c, next) => {
    const polar = new Polar({
        accessToken: c.env.POLAR_ACCESS_TOKEN,
        server: "sandbox",
    });
    c.set("polar", polar);

    await next();
});

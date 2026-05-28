import { getPublicOrigin } from "@shared/public-origin.ts";
import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import type { Env } from "../env.ts";

export const createDocsRoutes = (apiRouter: Hono<Env>) => {
    return new Hono<Env>()
        .get("/", (c) => {
            const reqUrl = new URL(c.req.url);
            const url = new URL(getPublicOrigin(c));
            url.protocol = "https:";
            url.hostname = url.hostname.replace(/(^|\.)enter\./, "$1gen.");
            url.pathname = "/docs";
            url.search = reqUrl.search;
            return c.redirect(url.toString(), 301);
        })
        .get("/open-api/generate-schema", async (c, next) => {
            const handler = openAPIRouteHandler(apiRouter, {
                documentation: {
                    info: {
                        title: "Pollinations Account API",
                        version: "0.3.0",
                    },
                },
            });

            return handler(c, next);
        });
};

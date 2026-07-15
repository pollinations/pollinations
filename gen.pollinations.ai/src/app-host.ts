import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import {
    deploymentSlugFromHostname,
    serveDeployment,
} from "./routes/deployment-assets.ts";

const app = new Hono<Env>();

app.all("*", async (c) => {
    const host = c.env.APP_DEPLOY_HOST;
    const slug = host
        ? deploymentSlugFromHostname(new URL(c.req.url).hostname, host)
        : null;
    if (!slug) throw new HTTPException(404);
    return await serveDeployment(c, slug, new URL(c.req.url).pathname);
});

app.notFound((c) => c.text("Not Found", 404));
app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    console.error("App host error", error);
    return c.text("Internal Server Error", 500);
});

export default app;

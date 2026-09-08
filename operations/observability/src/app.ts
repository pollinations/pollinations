import { createPollinationsAuth } from "@pollinations/auth/server";
import { Hono } from "hono";

export type Bindings = {
    ASSETS: { fetch: typeof fetch };
    POLLINATIONS_OAUTH_CLIENT_ID: string;
    POLLINATIONS_AUTH_SESSION_SECRET: string;
    POLLINATIONS_AUTH_BASE_URL?: string;
};

// Only the private Grafana upstream receives these headers. Browser-supplied
// identity headers, bearer tokens and Grafana cookies are never trusted.
export function createObservabilityApp(
    forward: (request: Request) => Promise<Response>,
) {
    return new Hono<{ Bindings: Bindings }>().all("*", async (c) => {
        const path = c.req.path;
        if (
            !path.startsWith("/auth/") &&
            !path.startsWith("/grafana/") &&
            !path.startsWith("/api/")
        )
            return c.env.ASSETS.fetch(c.req.raw);
        c.header("Cache-Control", "private, no-store");
        if (!c.env.POLLINATIONS_AUTH_SESSION_SECRET)
            return c.json(
                { error: "App session signing is not configured" },
                503,
            );
        const auth = createPollinationsAuth({
            clientId: c.env.POLLINATIONS_OAUTH_CLIENT_ID,
            sessionSecret: c.env.POLLINATIONS_AUTH_SESSION_SECRET,
            baseUrl: c.env.POLLINATIONS_AUTH_BASE_URL,
        });
        const authResponse = await auth.handle(c.req.raw);
        if (authResponse) return authResponse;
        const user = await auth.getUser(c.req.raw);
        if (!user)
            return c.json({ error: "Sign in to this app to continue" }, 401);
        if (!path.startsWith("/grafana/")) return c.notFound();
        const headers = new Headers(c.req.raw.headers);
        for (const name of [...headers.keys()]) {
            if (
                name.toLowerCase().startsWith("x-webauth-") ||
                ["authorization", "cookie"].includes(name.toLowerCase())
            )
                headers.delete(name);
        }
        headers.set("X-WEBAUTH-USER", user.sub);
        headers.set("X-WEBAUTH-ROLE", "Editor");
        c.res = await forward(new Request(c.req.raw, { headers }));
        if (c.res.status === 101) return c.res;
        c.header("Cache-Control", "private, no-store");
        c.header("Content-Security-Policy", "frame-ancestors 'self'", {
            append: true,
        });
        return c.res;
    });
}

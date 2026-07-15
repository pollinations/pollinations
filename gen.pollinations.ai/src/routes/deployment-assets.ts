import { appDeployment } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";

export function normalizeDeploymentPath(path: string): string {
    if (
        path.startsWith("/") ||
        path.endsWith("/") ||
        path.includes("\\") ||
        path.includes("\0")
    ) {
        throw new HTTPException(400, {
            message: `Invalid deployment path: ${path}`,
        });
    }

    const segments = path.split("/");
    if (
        segments.some(
            (segment) =>
                segment.length === 0 || segment === "." || segment === "..",
        )
    ) {
        throw new HTTPException(400, {
            message: `Invalid deployment path: ${path}`,
        });
    }
    return path;
}

export function deploymentSlugFromHostname(
    hostname: string,
    deploymentHost: string,
): string | null {
    const suffix = `.${deploymentHost.toLowerCase()}`;
    const normalized = hostname.toLowerCase();
    if (!normalized.endsWith(suffix)) return null;
    const slug = normalized.slice(0, -suffix.length);
    return slug && !slug.includes(".") ? slug : null;
}

export async function serveDeployment(
    c: Context<Env>,
    slug: string,
    rawPath: string,
): Promise<Response> {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        throw new HTTPException(405);
    }

    const [deployment] = await drizzle(c.env.DB)
        .select({ id: appDeployment.id, version: appDeployment.version })
        .from(appDeployment)
        .where(eq(appDeployment.slug, slug))
        .limit(1);
    if (!deployment) throw new HTTPException(404);

    let path = rawPath.replace(/^\/+/, "") || "index.html";
    try {
        path = normalizeDeploymentPath(path);
    } catch {
        throw new HTTPException(404);
    }

    const key = `deployments/${deployment.id}/${deployment.version}/${path}`;
    let object = await c.env.APP_BUCKET.get(key);
    if (!object && c.req.header("Accept")?.includes("text/html")) {
        object = await c.env.APP_BUCKET.get(
            `deployments/${deployment.id}/${deployment.version}/index.html`,
        );
    }
    if (!object) throw new HTTPException(404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "no-cache");
    return new Response(c.req.method === "HEAD" ? null : object.body, {
        headers,
    });
}

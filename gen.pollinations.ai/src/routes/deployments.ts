import { appDeployment } from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { auth } from "@/middleware/auth.ts";
import { normalizeDeploymentPath } from "./deployment-assets.ts";

const MAX_FILES = 256;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DEPLOYMENT_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 14 * 1024 * 1024;
const MAX_DEPLOYMENTS_PER_USER = 20;
const DEFAULT_DEPLOY_HOST = "pollinations.ai";

const DeploymentFileSchema = z.object({
    path: z.string().min(1).max(512),
    content: z.string(),
    encoding: z.enum(["utf8", "base64"]).default("utf8"),
    contentType: z.string().min(1).max(255).optional(),
});

const DeploymentBodySchema = z.object({
    name: z.string().min(1).max(80),
    files: z.array(DeploymentFileSchema).min(1).max(MAX_FILES),
});

const DeploymentResponseSchema = z.object({
    id: z.string(),
    slug: z.string(),
    version: z.string(),
    url: z.string().url(),
});

const DeploymentListItemSchema = DeploymentResponseSchema.extend({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

type DeploymentBody = z.infer<typeof DeploymentBodySchema>;

type PreparedFile = {
    path: string;
    body: Uint8Array;
    contentType: string;
};

function badRequest(message: string): never {
    throw new HTTPException(400, { message });
}

function decodeBase64(content: string, path: string): Uint8Array {
    try {
        const binary = atob(content);
        return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    } catch {
        return badRequest(`Invalid base64 content for ${path}`);
    }
}

function inferContentType(path: string): string {
    const extension = path.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
        avif: "image/avif",
        css: "text/css; charset=utf-8",
        gif: "image/gif",
        html: "text/html; charset=utf-8",
        ico: "image/x-icon",
        jpeg: "image/jpeg",
        jpg: "image/jpeg",
        js: "text/javascript; charset=utf-8",
        json: "application/json; charset=utf-8",
        mjs: "text/javascript; charset=utf-8",
        mp3: "audio/mpeg",
        mp4: "video/mp4",
        png: "image/png",
        svg: "image/svg+xml",
        txt: "text/plain; charset=utf-8",
        wasm: "application/wasm",
        webm: "video/webm",
        webp: "image/webp",
        woff: "font/woff",
        woff2: "font/woff2",
        xml: "application/xml; charset=utf-8",
    };
    return contentTypes[extension ?? ""] ?? "application/octet-stream";
}

function prepareFiles(files: DeploymentBody["files"]): PreparedFile[] {
    const encoder = new TextEncoder();
    const paths = new Set<string>();
    let totalBytes = 0;

    const prepared = files.map((file) => {
        const path = normalizeDeploymentPath(file.path);
        if (paths.has(path)) badRequest(`Duplicate deployment path: ${path}`);
        paths.add(path);

        const body =
            file.encoding === "base64"
                ? decodeBase64(file.content, path)
                : encoder.encode(file.content);
        if (body.byteLength > MAX_FILE_BYTES) {
            badRequest(`${path} exceeds the 5 MB file limit`);
        }
        totalBytes += body.byteLength;
        if (totalBytes > MAX_DEPLOYMENT_BYTES) {
            badRequest("Deployment exceeds the 10 MB total limit");
        }

        return {
            path,
            body,
            contentType: file.contentType ?? inferContentType(path),
        };
    });

    if (!paths.has("index.html")) {
        badRequest("Deployment must include index.html");
    }
    return prepared;
}

function slugify(name: string): string {
    const normalized = name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    return normalized || "app";
}

function publicDeploymentUrl(c: Context<Env>, slug: string): string {
    if (c.env.ENVIRONMENT === "production" || c.env.ENVIRONMENT === "staging") {
        const host = c.env.APP_DEPLOY_HOST || DEFAULT_DEPLOY_HOST;
        return `https://${slug}.${host}/`;
    }
    return `${new URL(c.req.url).origin}/apps/${slug}/`;
}

function requireDeployAccess(c: Context<Env>) {
    const user = c.var.auth.requireUser();
    if (!c.var.auth.apiKey?.permissions?.account?.includes("deploy")) {
        throw new HTTPException(403, {
            message: "This API key does not have the deploy permission",
        });
    }
    return user;
}

async function uploadFiles(
    bucket: R2Bucket,
    deploymentId: string,
    version: string,
    files: PreparedFile[],
): Promise<void> {
    let nextIndex = 0;
    await Promise.all(
        Array.from({ length: Math.min(6, files.length) }, async () => {
            while (nextIndex < files.length) {
                const file = files[nextIndex++];
                await bucket.put(
                    `deployments/${deploymentId}/${version}/${file.path}`,
                    file.body,
                    { httpMetadata: { contentType: file.contentType } },
                );
            }
        }),
    );
}

async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<void> {
    let cursor: string | undefined;
    do {
        const page = await bucket.list({ prefix, cursor });
        if (page.objects.length > 0) {
            await bucket.delete(page.objects.map((object) => object.key));
        }
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
}

async function syncDeploymentDomain(
    c: Context<Env>,
    slug: string,
    method: "POST" | "DELETE",
): Promise<void> {
    if (c.env.ENVIRONMENT !== "production" && c.env.ENVIRONMENT !== "staging") {
        return;
    }
    const response = await c.env.ENTER.fetch(
        `https://enter.pollinations.ai/api/admin/deployment-domains/${slug}`,
        {
            method,
            headers: { Authorization: `Bearer ${c.env.PLN_ENTER_TOKEN}` },
        },
    );
    if (!response.ok) {
        throw new HTTPException(502, {
            message: `Could not ${method === "POST" ? "attach" : "detach"} deployment domain`,
        });
    }
}

const deploymentBodyLimit = bodyLimit({
    maxSize: MAX_REQUEST_BYTES,
    onError: (c) => c.json({ error: "Deployment request exceeds 14 MB" }, 413),
});

export const deploymentRoutes = new Hono<Env>()
    .use("*", auth())
    .use("*", async (c, next) => {
        requireDeployAccess(c);
        await next();
    })
    .get(
        "/",
        describeRoute({
            tags: ["Deployments"],
            summary: "List Frontend Deployments",
            description:
                "Lists static frontend apps owned by the authenticated account. Requires the `account:deploy` permission.",
            responses: {
                200: {
                    description: "Frontend deployments",
                    content: {
                        "application/json": {
                            schema: resolver(z.array(DeploymentListItemSchema)),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Deploy permission required" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const rows = await drizzle(c.env.DB)
                .select({
                    id: appDeployment.id,
                    slug: appDeployment.slug,
                    version: appDeployment.version,
                    createdAt: appDeployment.createdAt,
                    updatedAt: appDeployment.updatedAt,
                })
                .from(appDeployment)
                .where(eq(appDeployment.userId, user.id));
            return c.json(
                rows.map((row) => ({
                    ...row,
                    url: publicDeploymentUrl(c, row.slug),
                })),
            );
        },
    )
    .post(
        "/",
        describeRoute({
            tags: ["Deployments"],
            summary: "Publish Frontend App",
            description:
                "Publishes pre-built static browser assets to an isolated Pollinations subdomain. Requires the `account:deploy` permission and an `index.html` file.",
            responses: {
                201: {
                    description: "Frontend app published",
                    content: {
                        "application/json": {
                            schema: resolver(DeploymentResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid static asset set" },
                401: { description: "Unauthorized" },
                403: { description: "Deploy permission required" },
                409: { description: "Deployment quota reached" },
                413: { description: "Deployment too large" },
            },
        }),
        deploymentBodyLimit,
        validator("json", DeploymentBodySchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const existing = await drizzle(c.env.DB)
                .select({ id: appDeployment.id })
                .from(appDeployment)
                .where(eq(appDeployment.userId, user.id))
                .limit(MAX_DEPLOYMENTS_PER_USER);
            if (existing.length >= MAX_DEPLOYMENTS_PER_USER) {
                throw new HTTPException(409, {
                    message: `Accounts can publish up to ${MAX_DEPLOYMENTS_PER_USER} apps`,
                });
            }

            const body = c.req.valid("json");
            const files = prepareFiles(body.files);
            const id = crypto.randomUUID();
            const version = crypto.randomUUID();
            const environmentPrefix =
                c.env.ENVIRONMENT === "staging" ? "stg-" : "";
            const slug = `${environmentPrefix}${slugify(body.name)}-${id.slice(0, 8)}`;

            await uploadFiles(c.env.APP_BUCKET, id, version, files);
            let domainAttached = false;
            try {
                await syncDeploymentDomain(c, slug, "POST");
                domainAttached = true;
                await drizzle(c.env.DB).insert(appDeployment).values({
                    id,
                    slug,
                    userId: user.id,
                    version,
                });
            } catch (error) {
                if (domainAttached) {
                    c.executionCtx.waitUntil(
                        syncDeploymentDomain(c, slug, "DELETE").catch(() => {}),
                    );
                }
                await deletePrefix(c.env.APP_BUCKET, `deployments/${id}/`);
                throw error;
            }

            return c.json(
                { id, slug, version, url: publicDeploymentUrl(c, slug) },
                201,
            );
        },
    )
    .put(
        "/:id",
        describeRoute({
            tags: ["Deployments"],
            summary: "Update Frontend Deployment",
            description:
                "Atomically switches an owned frontend deployment to a new static asset version. Requires the `account:deploy` permission.",
            responses: {
                200: {
                    description: "Frontend deployment updated",
                    content: {
                        "application/json": {
                            schema: resolver(DeploymentResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid static asset set" },
                401: { description: "Unauthorized" },
                403: { description: "Deploy permission required" },
                404: { description: "Deployment not found" },
                413: { description: "Deployment too large" },
            },
        }),
        deploymentBodyLimit,
        validator("json", DeploymentBodySchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const [deployment] = await drizzle(c.env.DB)
                .select()
                .from(appDeployment)
                .where(eq(appDeployment.id, c.req.param("id")))
                .limit(1);
            if (!deployment || deployment.userId !== user.id) {
                throw new HTTPException(404, {
                    message: "Deployment not found",
                });
            }

            const body = c.req.valid("json");
            const files = prepareFiles(body.files);
            const version = crypto.randomUUID();
            await uploadFiles(c.env.APP_BUCKET, deployment.id, version, files);
            try {
                await drizzle(c.env.DB)
                    .update(appDeployment)
                    .set({ version, updatedAt: new Date() })
                    .where(eq(appDeployment.id, deployment.id));
            } catch (error) {
                await deletePrefix(
                    c.env.APP_BUCKET,
                    `deployments/${deployment.id}/${version}/`,
                );
                throw error;
            }
            c.executionCtx.waitUntil(
                deletePrefix(
                    c.env.APP_BUCKET,
                    `deployments/${deployment.id}/${deployment.version}/`,
                ),
            );

            return c.json({
                id: deployment.id,
                slug: deployment.slug,
                version,
                url: publicDeploymentUrl(c, deployment.slug),
            });
        },
    )
    .delete(
        "/:id",
        describeRoute({
            tags: ["Deployments"],
            summary: "Delete Frontend Deployment",
            description:
                "Deletes an owned frontend deployment and its static assets. Requires the `account:deploy` permission.",
            responses: {
                204: { description: "Frontend deployment deleted" },
                401: { description: "Unauthorized" },
                403: { description: "Deploy permission required" },
                404: { description: "Deployment not found" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const [deployment] = await drizzle(c.env.DB)
                .select({
                    id: appDeployment.id,
                    slug: appDeployment.slug,
                    userId: appDeployment.userId,
                })
                .from(appDeployment)
                .where(eq(appDeployment.id, c.req.param("id")))
                .limit(1);
            if (!deployment || deployment.userId !== user.id) {
                throw new HTTPException(404, {
                    message: "Deployment not found",
                });
            }

            await syncDeploymentDomain(c, deployment.slug, "DELETE");
            await drizzle(c.env.DB)
                .delete(appDeployment)
                .where(eq(appDeployment.id, deployment.id));
            c.executionCtx.waitUntil(
                deletePrefix(c.env.APP_BUCKET, `deployments/${deployment.id}/`),
            );
            return c.body(null, 204);
        },
    );

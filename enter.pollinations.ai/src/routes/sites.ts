import { requireAccountPermission } from "@shared/auth/account-permissions.ts";
import { site } from "@shared/db/sites.ts";
import { ValidationError } from "@shared/http/validation-error.ts";
import { validator } from "@shared/middleware/validator.ts";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    deleteSite,
    prepareInlineFiles,
    publishSite,
    startSiteUpload,
    uploadSiteFiles,
} from "../services/sites.ts";

export const SITE_LIMITS = {
    sites: 5,
    bytesPerSite: 200 * 1024 * 1024,
    filesPerSite: 1000,
    // Cloudflare's own limit for one static asset.
    bytesPerFile: 25 * 1024 * 1024,
    // Request body of a deploy with inline files. Enter holds several copies
    // of them in memory (128 MB per isolate), so bigger sites use the upload.
    bytesPerInlineDeploy: 5 * 1024 * 1024,
};

// Names are one DNS label under the sites domain. They start with a letter:
// <port>-<id> hosts are sandbox ports. "--" separates the environment, as in
// my-app--staging.pollinations.app.
const SITE_NAME = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
const RESERVED_NAMES = new Set([
    "abuse",
    "admin",
    "api",
    "app",
    "apps",
    "auth",
    "docs",
    "enter",
    "gen",
    "help",
    "login",
    "mail",
    "media",
    "myceli",
    "polli",
    "pollinations",
    "security",
    "staging",
    "status",
    "support",
    "www",
]);

const SiteNameSchema = z
    .string()
    .regex(
        SITE_NAME,
        "Site names are 3-32 lowercase letters, digits and hyphens, starting with a letter",
    )
    .refine((name) => !name.includes("--"), "Site names cannot contain --")
    .refine((name) => !RESERVED_NAMES.has(name), "This site name is reserved")
    .meta({ example: "my-site" });

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

// Cloudflare's direct upload manifest: path -> { hash, size }. The hash is
// any 32 hex characters that identify the content and its type; our CLI uses
// Cloudflare's example (SHA-256 of the base64 content plus the extension).
const ManifestSchema = z
    .record(
        z
            .string()
            .regex(/^\/[^\s?#]*$/, "Paths start with / and have no spaces"),
        z.object({
            hash: z.string().regex(/^[0-9a-f]{32}$/),
            size: z
                .number()
                .int()
                .min(0)
                .max(
                    SITE_LIMITS.bytesPerFile,
                    `Each file can be at most ${megabytes(SITE_LIMITS.bytesPerFile)}`,
                ),
        }),
    )
    .refine((manifest) => "/index.html" in manifest, "/index.html is required")
    .refine(
        (manifest) => Object.keys(manifest).length <= SITE_LIMITS.filesPerSite,
        `A site can have at most ${SITE_LIMITS.filesPerSite} files`,
    )
    .refine(
        (manifest) =>
            Object.values(manifest).reduce((sum, file) => sum + file.size, 0) <=
            SITE_LIMITS.bytesPerSite,
        `A site can be at most ${megabytes(SITE_LIMITS.bytesPerSite)}`,
    );

// Vercel's inline file shape (POST /v13/deployments).
const InlineFileSchema = z.object({
    file: z.string().min(1).meta({ description: "Path, e.g. `index.html`" }),
    data: z.string(),
    encoding: z.enum(["utf-8", "base64"]).optional(),
});

const inlineBodyLimit = bodyLimit({
    maxSize: SITE_LIMITS.bytesPerInlineDeploy,
    onError: () => {
        throw new HTTPException(413, {
            message: `A request with inline files can be at most ${megabytes(SITE_LIMITS.bytesPerInlineDeploy)}. Upload bigger sites with POST /account/sites/{name}/upload.`,
        });
    },
});

const SiteSchema = z.object({
    name: z.string(),
    url: z.string(),
    createdAt: z.string(),
    publishedAt: z.string().nullable(),
    blocked: z.boolean(),
});

type SiteRow = typeof site.$inferSelect;

function siteUrl(env: Env["Bindings"], name: string) {
    return `https://${name}${env.SITES_HOST_SUFFIX}`;
}

function toResponse(env: Env["Bindings"], row: SiteRow) {
    return {
        name: row.name,
        url: siteUrl(env, row.name),
        createdAt: row.createdAt.toISOString(),
        publishedAt: row.publishedAt?.toISOString() ?? null,
        blocked: row.blockedAt !== null,
    };
}

function requireUsable(row: SiteRow | undefined, userId: string) {
    if (!row) throw new HTTPException(404, { message: "Site not found" });
    if (row.userId !== userId) {
        throw new HTTPException(409, { message: "This site name is taken" });
    }
    if (row.blockedAt) {
        throw new HTTPException(403, {
            message: "This site was taken down for breaking our terms",
        });
    }
    return row;
}

async function findSite(db: ReturnType<typeof drizzle>, name: string) {
    const [row] = await db.select().from(site).where(eq(site.name, name));
    return row;
}

// The first upload claims the name. One statement checks the per-account
// limit and inserts, so parallel claims can't exceed it.
async function claimSite(d1: D1Database, name: string, userId: string) {
    const db = drizzle(d1);
    const existing = await findSite(db, name);
    if (existing) return requireUsable(existing, userId);
    await d1
        .prepare(
            `INSERT INTO site (name, user_id, created_at)
             SELECT ?, ?, unixepoch()
             WHERE (SELECT count(*) FROM site WHERE user_id = ?) < ?
             ON CONFLICT DO NOTHING`,
        )
        .bind(name, userId, userId, SITE_LIMITS.sites)
        .run();
    const row = await findSite(db, name);
    if (!row) {
        throw new HTTPException(403, {
            message: `You can have at most ${SITE_LIMITS.sites} sites. Delete one with DELETE /account/sites/{name} first.`,
        });
    }
    // Someone else may have claimed it between the read and the insert.
    return requireUsable(row, userId);
}

const errors = {
    401: { description: "Unauthorized" },
    403: {
        description: "Permission denied, site limit reached, or taken down",
    },
};

export const sitesRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: false, allowApiKey: true }))
    .get(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List Sites",
            description:
                "Your sites at `https://<name>.pollinations.app`, and the account's limits. API keys need `account:machines`.",
            responses: {
                200: {
                    description: "Owned sites and limits",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.object({
                                    data: z.array(SiteSchema),
                                    limits: z.object({
                                        sites: z.number(),
                                        bytesPerSite: z.number(),
                                        filesPerSite: z.number(),
                                        bytesPerFile: z.number(),
                                        bytesPerInlineDeploy: z.number(),
                                    }),
                                }),
                            ),
                        },
                    },
                },
                ...errors,
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            requireAccountPermission(c.var.auth.apiKey, "machines");
            const rows = await drizzle(c.env.DB)
                .select()
                .from(site)
                .where(eq(site.userId, user.id))
                .orderBy(desc(site.createdAt));
            return c.json({
                data: rows.map((row) => toResponse(c.env, row)),
                limits: SITE_LIMITS,
            });
        },
    )
    .post(
        "/:name/upload",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Start Site Upload",
            description: [
                "Step 1 of 2. Send each file's path, hash and size; the first upload claims the name. The hash is the first 32 hex characters of the SHA-256 of the file's base64 content plus its extension (`polli sites deploy` does all of this).",
                "",
                "`buckets` lists the hashes Cloudflare doesn't have yet. POST each bucket to `uploadUrl` with `Authorization: Bearer <jwt>` as multipart form data, one field per file: the hash as name, the base64 content as value. The last upload returns the JWT for step 2. If `buckets` is empty, use `jwt` as is.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Upload session",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.object({
                                    uploadUrl: z.string(),
                                    jwt: z.string(),
                                    buckets: z.array(z.array(z.string())),
                                }),
                            ),
                        },
                    },
                },
                400: { description: "Invalid name or manifest" },
                ...errors,
                409: { description: "Site name is taken" },
            },
        }),
        validator("param", z.object({ name: SiteNameSchema })),
        validator(
            "json",
            z.object({ manifest: ManifestSchema }).meta({
                example: {
                    manifest: {
                        "/index.html": {
                            hash: "3f8a1c2e9b7d4f60a1e2c3d4b5f6a7e8",
                            size: 1024,
                        },
                    },
                },
            }),
        ),
        async (c) => {
            const user = c.var.auth.requireUser();
            requireAccountPermission(c.var.auth.apiKey, "machines");
            const { name } = c.req.valid("param");
            await claimSite(c.env.DB, name, user.id);
            return c.json(
                await startSiteUpload(
                    c.env,
                    name,
                    c.req.valid("json").manifest,
                ),
            );
        },
    )
    .put(
        "/:name",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Publish Site",
            description: [
                "Step 2 of 2. Publishes the uploaded files with the JWT from step 1. The site is live at `url` when this returns.",
                "",
                "Small sites can skip step 1 and send `files` instead of `jwt`, as Vercel's deployment API takes them: `file` is the path (`index.html` is required), `encoding` is `utf-8` (default) or `base64`. The request body can be up to " +
                    megabytes(SITE_LIMITS.bytesPerInlineDeploy) +
                    ", and the first deploy claims the name.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Published site",
                    content: {
                        "application/json": { schema: resolver(SiteSchema) },
                    },
                },
                400: { description: "Invalid files or expired upload JWT" },
                ...errors,
                404: { description: "Site not found" },
                409: { description: "Site name is taken" },
                413: {
                    description: `Request body over ${megabytes(SITE_LIMITS.bytesPerInlineDeploy)}`,
                },
            },
        }),
        inlineBodyLimit,
        validator("param", z.object({ name: SiteNameSchema })),
        validator(
            "json",
            z
                .union([
                    z.object({
                        jwt: z
                            .string()
                            .min(1)
                            .meta({ example: "eyJhbGciOiJIUzI1NiJ9" }),
                    }),
                    z.object({
                        files: z
                            .array(InlineFileSchema)
                            .min(1)
                            .max(SITE_LIMITS.filesPerSite),
                    }),
                ])
                .meta({
                    example: {
                        files: [{ file: "index.html", data: "<h1>Hello</h1>" }],
                    },
                }),
        ),
        async (c) => {
            const user = c.var.auth.requireUser();
            requireAccountPermission(c.var.auth.apiKey, "machines");
            const { name } = c.req.valid("param");
            const body = c.req.valid("json");
            const db = drizzle(c.env.DB);
            let jwt: string;
            if ("jwt" in body) {
                requireUsable(await findSite(db, name), user.id);
                jwt = body.jwt;
            } else {
                const { manifest, contents } = await prepareInlineFiles(
                    body.files,
                );
                const checked = ManifestSchema.safeParse(manifest);
                if (!checked.success) {
                    throw new ValidationError(checked.error, "json");
                }
                await claimSite(c.env.DB, name, user.id);
                const session = await startSiteUpload(c.env, name, manifest);
                jwt = await uploadSiteFiles(c.env, session, contents);
            }
            await publishSite(c.env, name, user.id, jwt);
            const [row] = await db
                .update(site)
                .set({ publishedAt: new Date() })
                .where(and(eq(site.name, name), eq(site.userId, user.id)))
                .returning();
            return c.json(toResponse(c.env, row));
        },
    )
    .delete(
        "/:name",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Delete Site",
            description: "Takes the site offline and frees its name.",
            responses: {
                200: {
                    description: "Deleted site",
                    content: {
                        "application/json": {
                            schema: resolver(z.object({ name: z.string() })),
                        },
                    },
                },
                ...errors,
                404: { description: "Site not found" },
            },
        }),
        validator(
            "param",
            z.object({ name: z.string().meta({ example: "my-site" }) }),
        ),
        async (c) => {
            const user = c.var.auth.requireUser();
            requireAccountPermission(c.var.auth.apiKey, "machines");
            const { name } = c.req.valid("param");
            const db = drizzle(c.env.DB);
            const row = await findSite(db, name);
            if (row?.userId !== user.id) {
                throw new HTTPException(404, { message: "Site not found" });
            }
            requireUsable(row, user.id);
            await deleteSite(c.env, name);
            await db
                .delete(site)
                .where(and(eq(site.name, name), eq(site.userId, user.id)));
            return c.json({ name });
        },
    );

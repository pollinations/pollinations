import { requireAccountPermission } from "@shared/auth/account-permissions.ts";
import { site } from "@shared/db/sites.ts";
import { validator } from "@shared/middleware/validator.ts";
import { and, count, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { deleteSite, publishSite, startSiteUpload } from "../services/sites.ts";

export const SITE_LIMITS = {
    sites: 5,
    bytesPerSite: 200 * 1024 * 1024,
    filesPerSite: 1000,
    // Cloudflare's own limit for one static asset.
    bytesPerFile: 25 * 1024 * 1024,
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
    .refine((name) => !RESERVED_NAMES.has(name), "This site name is reserved");

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

// Cloudflare's direct upload manifest: path -> { hash, size }. The hash is
// any 32 hex characters that identify the content; our CLI uses the first 32
// of the SHA-256.
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

// The first upload claims the name, within the per-account limit.
async function claimSite(
    db: ReturnType<typeof drizzle>,
    name: string,
    userId: string,
) {
    const existing = await findSite(db, name);
    if (existing) return requireUsable(existing, userId);
    const [{ owned }] = await db
        .select({ owned: count() })
        .from(site)
        .where(eq(site.userId, userId));
    if (owned >= SITE_LIMITS.sites) {
        throw new HTTPException(403, {
            message: `You can have at most ${SITE_LIMITS.sites} sites. Delete one with DELETE /account/sites/{name} first.`,
        });
    }
    const [row] = await db
        .insert(site)
        .values({ name, userId, createdAt: new Date() })
        .onConflictDoNothing()
        .returning();
    // Someone else claimed it between the read and the insert.
    return row ?? requireUsable(await findSite(db, name), userId);
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
                "List the static sites owned by the authenticated account, with the account's limits. API keys require `account:machines`.",
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
                "Step 1 of a deploy. Send a manifest of every file in the site (`path` -> `{hash, size}`, the hash being 32 hex characters such as the first 32 of the file's SHA-256). The first upload claims the name.",
                "",
                "Upload each bucket of hashes to `uploadUrl` with `Authorization: Bearer <jwt>`, as `multipart/form-data` with one part per file, named by its hash and holding its base64 content. The last upload returns the completion JWT. Empty `buckets` means every file is already uploaded and `jwt` is the completion JWT.",
                "",
                "Then publish with `PUT /account/sites/{name}`. API keys require `account:machines`.",
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
        validator("json", z.object({ manifest: ManifestSchema })),
        async (c) => {
            const user = c.var.auth.requireUser();
            requireAccountPermission(c.var.auth.apiKey, "machines");
            const { name } = c.req.valid("param");
            await claimSite(drizzle(c.env.DB), name, user.id);
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
            description:
                "Step 2 of a deploy. Publish the uploaded files with the completion JWT from `POST /account/sites/{name}/upload`. The site is live at `url` when this returns. API keys require `account:machines`.",
            responses: {
                200: {
                    description: "Published site",
                    content: {
                        "application/json": { schema: resolver(SiteSchema) },
                    },
                },
                400: { description: "Invalid or expired upload JWT" },
                ...errors,
                404: { description: "Site not found" },
                409: { description: "Site name is taken" },
            },
        }),
        validator("param", z.object({ name: SiteNameSchema })),
        validator("json", z.object({ jwt: z.string().min(1) })),
        async (c) => {
            const user = c.var.auth.requireUser();
            requireAccountPermission(c.var.auth.apiKey, "machines");
            const { name } = c.req.valid("param");
            const db = drizzle(c.env.DB);
            requireUsable(await findSite(db, name), user.id);
            await publishSite(c.env, name, user.id, c.req.valid("json").jwt);
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
            description:
                "Take a site offline and free its name. API keys require `account:machines`.",
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
        async (c) => {
            const user = c.var.auth.requireUser();
            requireAccountPermission(c.var.auth.apiKey, "machines");
            const name = c.req.param("name");
            const db = drizzle(c.env.DB);
            const row = await findSite(db, name);
            if (row?.userId !== user.id) {
                throw new HTTPException(404, { message: "Site not found" });
            }
            requireUsable(row, user.id);
            await deleteSite(c.env, name);
            await db.delete(site).where(eq(site.name, name));
            return c.json({ name });
        },
    );

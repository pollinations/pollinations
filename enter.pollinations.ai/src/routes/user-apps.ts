import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    APP_SLUG_PATTERN,
    type AppDeployConfig,
    appPublicUrl,
    appWorkerScriptName,
    attachAppDomain,
    decodeAppFiles,
    deployAppWorker,
    detachAppDomain,
    RESERVED_APP_SLUGS,
    requireAppDeployConfig,
} from "../services/app-deploy.ts";
import { deleteCommunityWorker } from "../services/worker-deploy.ts";
import { requireCommunityEndpointManageAccess } from "./community-endpoints.ts";

const SlugSchema = z
    .string()
    .regex(
        APP_SLUG_PATTERN,
        "Slug must be a lowercase DNS label (a-z, 0-9, hyphens; max 63 chars)",
    )
    .refine((slug) => !RESERVED_APP_SLUGS.has(slug), {
        message: "Slug is reserved",
    })
    .describe(
        "Immutable subdomain the app is served at: <slug>.pollinations.ai.",
    );
// Values are base64; paths are validated/normalized in decodeAppFiles so the
// caller gets one precise error instead of a zod record-key failure.
const FilesSchema = z
    .record(z.string(), z.string())
    .describe(
        "Static files keyed by path (e.g. index.html, assets/main.js), values base64-encoded.",
    );
const CreateAppSchema = z.object({
    slug: SlugSchema,
    files: FilesSchema,
});
const UpdateAppSchema = z.object({
    files: FilesSchema,
});
const UserAppResponseSchema = z.object({
    id: z.string(),
    slug: z.string(),
    url: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
const UserAppListResponseSchema = z.object({
    data: z.array(UserAppResponseSchema),
});
const UserAppDeleteResponseSchema = z.object({
    id: z.string(),
});

type Db = ReturnType<typeof drizzle<typeof schema>>;
type UserAppRow = typeof schema.userApp.$inferSelect;

function toResponse(row: UserAppRow, config: AppDeployConfig) {
    return {
        id: row.id,
        slug: row.slug,
        url: appPublicUrl(config, row.slug),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function decodeInputFiles(files: Record<string, string>) {
    try {
        return decodeAppFiles(files);
    } catch (error) {
        throw new HTTPException(400, {
            message: error instanceof Error ? error.message : "Invalid files",
        });
    }
}

async function requireOwnedApp(db: Db, id: string, ownerUserId: string) {
    const row = await db.query.userApp.findFirst({
        where: and(
            eq(schema.userApp.id, id),
            eq(schema.userApp.ownerUserId, ownerUserId),
        ),
    });
    if (!row) {
        throw new HTTPException(404, { message: "App not found" });
    }
    return row;
}

export const userAppsRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: true }))
    .get(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List My Apps",
            description:
                "List static apps owned by the authenticated account, each served at <slug>.pollinations.ai. Invite-only: same access gate as My Models. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Deployed apps",
                    content: {
                        "application/json": {
                            schema: resolver(UserAppListResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });
            await requireCommunityEndpointManageAccess(
                db,
                user.id,
                c.var.auth.apiKey,
            );
            const config = requireAppDeployConfig(c.env);
            const rows = await db.query.userApp.findMany({
                where: eq(schema.userApp.ownerUserId, user.id),
                orderBy: (app, { desc }) => [desc(app.createdAt)],
            });
            return c.json({
                data: rows.map((row) => toResponse(row, config)),
            });
        },
    )
    .post(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Deploy My App",
            description:
                "Deploy a static app (pre-built files, e.g. a dist/ folder) to <slug>.pollinations.ai. The slug is immutable and globally unique. Files are uploaded to a Pollinations-managed Cloudflare Worker with static assets; no server code runs. Invite-only: same access gate as My Models. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Deployed app",
                    content: {
                        "application/json": {
                            schema: resolver(UserAppResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid slug or files" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                409: { description: "Slug already taken" },
            },
        }),
        validator("json", CreateAppSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            await requireCommunityEndpointManageAccess(
                db,
                user.id,
                c.var.auth.apiKey,
            );
            const config = requireAppDeployConfig(c.env);
            const files = decodeInputFiles(input.files);
            const existing = await db.query.userApp.findFirst({
                columns: { id: true },
                where: eq(schema.userApp.slug, input.slug),
            });
            if (existing) {
                throw new HTTPException(409, {
                    message: "App slug is already taken",
                });
            }
            const id = crypto.randomUUID();
            const scriptName = appWorkerScriptName(id);
            const hostname = `${input.slug}.${config.originDomain}`;
            await deployAppWorker(config, scriptName, files);
            try {
                // The attach also guards slug races: Cloudflare rejects a
                // hostname that already has a DNS record or custom domain
                // (existing apps, core services), since no override flag is
                // sent.
                await attachAppDomain(config, hostname, scriptName);
            } catch (error) {
                // The attach may have thrown yet still taken effect (network
                // failure after Cloudflare applied it), which would leave the
                // hostname squatted with no recoverable row. detachAppDomain
                // is script-scoped and idempotent, so it is a no-op when the
                // hostname was never claimed or belongs to another script.
                await detachAppDomain(config, hostname, scriptName);
                await deleteCommunityWorker(config, scriptName);
                throw error;
            }
            try {
                const [row] = await db
                    .insert(schema.userApp)
                    .values({
                        id,
                        ownerUserId: user.id,
                        slug: input.slug,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .returning();
                return c.json(toResponse(row, config));
            } catch (error) {
                // The worker is live but the app isn't registered — remove
                // the orphans so no hostname/script outlives its D1 row.
                await detachAppDomain(config, hostname, scriptName);
                await deleteCommunityWorker(config, scriptName);
                throw error;
            }
        },
    )
    .post(
        "/:id/update",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Update My App",
            description:
                "Replace the deployed files of an app owned by the authenticated account. The slug cannot be changed; delete and re-create to move an app. Invite-only: same access gate as My Models. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Updated app",
                    content: {
                        "application/json": {
                            schema: resolver(UserAppResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid files" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "App not found" },
            },
        }),
        validator("json", UpdateAppSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            await requireCommunityEndpointManageAccess(
                db,
                user.id,
                c.var.auth.apiKey,
            );
            const config = requireAppDeployConfig(c.env);
            const files = decodeInputFiles(input.files);
            const app = await requireOwnedApp(db, id, user.id);
            await deployAppWorker(config, appWorkerScriptName(app.id), files);
            const [row] = await db
                .update(schema.userApp)
                .set({ updatedAt: new Date() })
                .where(eq(schema.userApp.id, app.id))
                .returning();
            if (!row) {
                // A concurrent delete removed the app mid-deploy; the redeploy
                // recreated the script (deployAppWorker upserts), so remove it
                // again. deleteCommunityWorker is idempotent.
                await deleteCommunityWorker(
                    config,
                    appWorkerScriptName(app.id),
                );
                throw new HTTPException(404, { message: "App not found" });
            }
            return c.json(toResponse(row, config));
        },
    )
    .delete(
        "/:id",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Delete My App",
            description:
                "Delete an app owned by the authenticated account, releasing its subdomain. Invite-only: same access gate as My Models. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Deleted app",
                    content: {
                        "application/json": {
                            schema: resolver(UserAppDeleteResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "App not found" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            await requireCommunityEndpointManageAccess(
                db,
                user.id,
                c.var.auth.apiKey,
            );
            const config = requireAppDeployConfig(c.env);
            const app = await requireOwnedApp(db, id, user.id);
            // Unpublish before dropping the row: hostname first (public
            // reachability), then the script, so a failure never leaves a
            // served app with no backing row. Both calls are idempotent.
            await detachAppDomain(
                config,
                `${app.slug}.${config.originDomain}`,
                appWorkerScriptName(app.id),
            );
            await deleteCommunityWorker(config, appWorkerScriptName(app.id));
            await db
                .delete(schema.userApp)
                .where(eq(schema.userApp.id, app.id));
            return c.json({ id });
        },
    );

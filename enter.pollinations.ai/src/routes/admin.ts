import { bytesToHex } from "@shared/client-ip.ts";
import { parseListingPayload } from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";
import {
    deployCodeAgent,
    loadCodeAgentSource,
} from "../services/code-agent.ts";
import {
    exportD1TinybirdPage,
    isD1TinybirdDatasource,
} from "../services/d1-tinybird-sync.ts";
import { questGrantAdminRoutes } from "./quest-grants.ts";
import { statusNoticeAdminRoutes } from "./status-notice.ts";

export const adminRoutes = new Hono<Env>()
    .use("*", async (c, next) => {
        const authHeader = c.req.header("Authorization");
        const providedKey = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;

        if (!providedKey) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        // Full admin token has access to all endpoints
        if (providedKey === c.env.PLN_ENTER_TOKEN) {
            return await next();
        }

        // The runner holds the token; the Worker stores only its hash.
        const exportTokenHash = c.env.D1_EXPORT_TOKEN_SHA256;
        if (
            exportTokenHash &&
            c.req.path.endsWith("/trigger-d1-sync") &&
            (await sha256(providedKey)) === exportTokenHash
        ) {
            return await next();
        }

        throw new HTTPException(401, { message: "Unauthorized" });
    })
    .post("/trigger-d1-sync", async (c) => {
        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            throw new HTTPException(400, { message: "Invalid JSON body" });
        }

        if (!body || typeof body !== "object") {
            throw new HTTPException(400, { message: "Invalid sync request" });
        }

        const { datasource, cursor } = body as {
            datasource?: unknown;
            cursor?: unknown;
        };

        if (
            typeof datasource !== "string" ||
            !isD1TinybirdDatasource(datasource)
        ) {
            throw new HTTPException(400, { message: "Invalid datasource" });
        }
        if (
            cursor !== undefined &&
            (typeof cursor !== "string" ||
                cursor.length === 0 ||
                cursor.length > 256)
        ) {
            throw new HTTPException(400, { message: "Invalid cursor" });
        }

        const result = await exportD1TinybirdPage(
            c.env.DB,
            datasource,
            cursor as string | undefined,
        );

        return c.json({
            success: true,
            datasource: result.datasource,
            rows: result.rows,
            next_cursor: result.nextCursor,
            done: result.done,
        });
    })
    // Each code agent runs a copy of the platform runtime frozen at upload
    // time. The production deploy calls this after every enter deploy so all
    // agents pick up the current runtime at their pinned owner commit.
    .post("/code-agents/redeploy", async (c) => {
        const rows = await drizzle(c.env.DB, { schema })
            .select({
                id: schema.communityEndpoint.id,
                payload: schema.communityEndpoint.payload,
            })
            .from(schema.communityEndpoint)
            .where(eq(schema.communityEndpoint.type, "code_agent"));
        const failed: { id: string; error: string }[] = [];
        for (const { id, payload } of rows) {
            try {
                const config = parseListingPayload("code_agent", payload);
                if (!config) throw new Error("invalid configuration");
                const source = await loadCodeAgentSource(
                    config.repository,
                    config.deployedCommitSha,
                );
                await deployCodeAgent(c.env, id, source);
            } catch (error) {
                failed.push({ id, error: (error as Error).message });
            }
        }
        return c.json({ redeployed: rows.length - failed.length, failed });
    })
    .route("/status-notice", statusNoticeAdminRoutes)
    .route("/quest-grants", questGrantAdminRoutes);

async function sha256(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    return bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
}

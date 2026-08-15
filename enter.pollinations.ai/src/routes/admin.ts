import {
    type RevokeKeySource,
    revokeApiKeyByHash,
} from "@shared/auth/revoke-api-key.ts";
import { bytesToHex } from "@shared/client-ip.ts";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";
import {
    exportD1TinybirdPage,
    isD1TinybirdDatasource,
} from "../services/d1-tinybird-sync.ts";
import { statusNoticeAdminRoutes } from "./status-notice.ts";

const REVOKE_SOURCES: RevokeKeySource[] = [
    "github_secret_scanning",
    "admin",
    "discord_bot",
];

function isRevokeSource(value: unknown): value is RevokeKeySource {
    return (
        typeof value === "string" &&
        REVOKE_SOURCES.includes(value as RevokeKeySource)
    );
}

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
    .post("/revoke-key", async (c) => {
        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            throw new HTTPException(400, { message: "Invalid JSON body" });
        }

        if (!body || typeof body !== "object") {
            throw new HTTPException(400, { message: "Invalid revoke request" });
        }

        const { keyHash, source, reference } = body as {
            keyHash?: unknown;
            source?: unknown;
            reference?: unknown;
        };

        if (
            typeof keyHash !== "string" ||
            !/^[A-Za-z0-9_-]{40,64}$/.test(keyHash)
        ) {
            throw new HTTPException(400, {
                message:
                    "keyHash must be a base64url SHA-256 digest (better-auth key hash)",
            });
        }
        if (!isRevokeSource(source)) {
            throw new HTTPException(400, {
                message: `source must be one of: ${REVOKE_SOURCES.join(", ")}`,
            });
        }
        if (
            reference !== undefined &&
            (typeof reference !== "string" ||
                reference.length === 0 ||
                reference.length > 500)
        ) {
            throw new HTTPException(400, {
                message: "reference must be a string of at most 500 chars",
            });
        }

        const db = drizzle(c.env.DB);
        const result = await revokeApiKeyByHash(db, {
            keyHash,
            triggeredBy: "admin",
            source,
            reference: reference as string | undefined,
        });

        if (!result) {
            throw new HTTPException(404, { message: "API key not found" });
        }

        return c.json({ success: true, revoked: result });
    })
    .route("/status-notice", statusNoticeAdminRoutes);

async function sha256(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    return bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
}

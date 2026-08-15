import { env } from "cloudflare:test";
import { hashApiKey, revokeApiKeyByHash } from "@shared/auth/revoke-api-key.ts";
import {
    apikeyRevocationAudit as apikeyRevocationAuditTable,
    apikey as apikeyTable,
} from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

describe("revokeApiKeyByHash", () => {
    test("revokes a key by hash and writes an audit row", async ({
        apiKey,
    }) => {
        const db = drizzle(env.DB);
        const keyHash = await hashApiKey(apiKey);

        const result = await revokeApiKeyByHash(db, {
            keyHash,
            triggeredBy: "github-secret-scanning",
            source: "github_secret_scanning",
            reference: "https://github.com/example/repo/commit/abc123",
        });

        expect(result).not.toBeNull();
        expect(result?.apikeyId).toBeTruthy();
        expect(result?.ownerUserId).toBeTruthy();
        expect(result?.ownerEmail).toBeTruthy();

        const remainingKeys = await db.select().from(apikeyTable).all();
        expect(remainingKeys).toHaveLength(0);

        const auditRows = await db
            .select()
            .from(apikeyRevocationAuditTable)
            .all();
        expect(auditRows).toHaveLength(1);
        expect(auditRows[0]).toMatchObject({
            keyHash,
            ownerEmail: result?.ownerEmail,
            source: "github_secret_scanning",
            triggeredBy: "github-secret-scanning",
            reference: "https://github.com/example/repo/commit/abc123",
        });
    });

    test("returns null for an unknown hash and writes no audit row", async () => {
        const db = drizzle(env.DB);

        const result = await revokeApiKeyByHash(db, {
            keyHash: "a".repeat(64),
            triggeredBy: "admin",
            source: "admin",
        });

        expect(result).toBeNull();
        const auditRows = await db
            .select()
            .from(apikeyRevocationAuditTable)
            .all();
        expect(auditRows).toHaveLength(0);
    });
});

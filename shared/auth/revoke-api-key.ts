import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
    apikeyRevocationAudit as apikeyRevocationAuditTable,
    apikey as apikeyTable,
    user as userTable,
} from "../db/better-auth.ts";

/**
 * Hash of an API key as stored in the apikey table: SHA-256 of the full key,
 * base64url-encoded without padding (better-auth's defaultKeyHasher). A leaked
 * `sk_...`/`pk_...` string can therefore be looked up without ever storing the
 * plaintext. This MUST stay in sync with better-auth's hashing.
 */
export async function hashApiKey(value: string): Promise<string> {
    const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    );
    let binary = "";
    for (const byte of digest) binary += String.fromCharCode(byte);
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export type RevokeKeySource =
    | "github_secret_scanning"
    | "admin"
    | "discord_bot";

export interface RevokeApiKeyInput {
    keyHash: string;
    triggeredBy: string;
    source: RevokeKeySource;
    /** Link to the offending repo/commit or app-submission issue. */
    reference?: string;
}

export interface RevokeApiKeyResult {
    apikeyId: string;
    ownerUserId: string;
    ownerEmail: string | null;
    name: string | null;
    remaining: number | null;
}

/**
 * Force-revoke an API key by its stored key hash, without userId scoping.
 * Writes an audit row for the paper trail. Returns null when no key matches
 * the hash (callers decide how to treat that — e.g. the secret-scanning
 * webhook still acknowledges with 2xx).
 */
export async function revokeApiKeyByHash(
    db: DrizzleD1Database,
    { keyHash, triggeredBy, source, reference }: RevokeApiKeyInput,
): Promise<RevokeApiKeyResult | null> {
    const key = await db
        .select()
        .from(apikeyTable)
        .where(eq(apikeyTable.key, keyHash))
        .get();
    if (!key) return null;

    const owner = await db
        .select({ email: userTable.email })
        .from(userTable)
        .where(eq(userTable.id, key.userId))
        .get();

    // Write the audit row before deleting the key so the snapshot is complete
    // even if the delete below fails.
    await db.insert(apikeyRevocationAuditTable).values({
        id: crypto.randomUUID(),
        apikeyId: key.id,
        keyHash,
        ownerUserId: key.userId,
        ownerEmail: owner?.email ?? null,
        triggeredBy,
        source,
        reference: reference ?? null,
        createdAt: new Date(),
    });

    await db.delete(apikeyTable).where(eq(apikeyTable.id, key.id));

    return {
        apikeyId: key.id,
        ownerUserId: key.userId,
        ownerEmail: owner?.email ?? null,
        name: key.name ?? null,
        remaining: key.remaining ?? null,
    };
}

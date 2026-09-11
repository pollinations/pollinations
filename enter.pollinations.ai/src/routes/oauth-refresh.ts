import { createApiKeyForUser } from "@shared/auth/api-key-creation.ts";
import { OFFLINE_ACCESS_SCOPE } from "@shared/auth/authorize-config.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { generateCode } from "./device.ts";

/** Seconds a client may use an access token before it has to refresh. */
export const REFRESH_ACCESS_TOKEN_TTL = 3600;
const REFRESH_TOKEN_LENGTH = 64;
const MIN_KV_TTL = 60;

/**
 * The consent behind a refresh token, captured when the code was exchanged.
 * A refresh re-mints exactly this when the key it points at was deleted; it
 * never widens what the user approved and ends when the approved key would
 * have expired.
 */
type RefreshGrant = {
    key: string;
    keyId: string;
    userId: string;
    clientId: string;
    redirectUri: string;
    name: string;
    scope: string | null;
    allowedModels: string[] | null;
    accountPermissions: string[] | null;
    /**
     * Budget left on the key at the last refresh. A re-mint starts from here,
     * not from the approved budget, so deleting the key never resets spend.
     */
    remainingBudget: number | null;
    /** Unix ms; null when the approved key never expires. */
    expiresAt: number | null;
};

export function tokenError(
    c: Context<Env>,
    error: string,
    description?: string,
) {
    return c.json(
        { error, ...(description && { error_description: description }) },
        400,
    );
}

export function hasOfflineAccess(scope: string | null | undefined): boolean {
    return scope?.split(" ").includes(OFFLINE_ACCESS_SCOPE) ?? false;
}

function remainingSeconds(expiresAt: number | null): number | null {
    if (expiresAt == null) return null;
    return Math.floor((expiresAt - Date.now()) / 1000);
}

function accessTokenExpiresIn(expiresAt: number | null): number {
    const remaining = remainingSeconds(expiresAt);
    return remaining == null
        ? REFRESH_ACCESS_TOKEN_TTL
        : Math.min(REFRESH_ACCESS_TOKEN_TTL, remaining);
}

function grantKvKey(refreshToken: string): string {
    return `oauth-refresh:${refreshToken}`;
}

async function putGrant(
    kv: KVNamespace,
    refreshToken: string,
    grant: RefreshGrant,
): Promise<void> {
    const remaining = remainingSeconds(grant.expiresAt);
    await kv.put(
        grantKvKey(refreshToken),
        JSON.stringify(grant),
        remaining == null
            ? undefined
            : { expirationTtl: Math.max(remaining, MIN_KV_TTL) },
    );
}

function parsePermissions(raw: string | null): Record<string, string[]> {
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

/**
 * Token-response fields for an `offline_access` grant, or null when the
 * consent key can't be found (the client then gets a plain, non-refreshable
 * response). Called once, at the authorization-code exchange.
 */
export async function issueRefreshToken(
    c: Context<Env>,
    code: {
        key: string;
        clientId: string;
        redirectUri: string;
        scope: string | null;
    },
): Promise<{ expires_in: number; refresh_token: string } | null> {
    const verified = await createAuth(c.env).api.verifyApiKey({
        body: { key: code.key },
    });
    const keyId = verified.key?.id;
    if (!verified.valid || typeof keyId !== "string") return null;

    const db = drizzle(c.env.DB, { schema });
    const row = await db.query.apikey.findFirst({
        where: eq(schema.apikey.id, keyId),
    });
    if (!row) return null;

    const permissions = parsePermissions(row.permissions);
    const grant: RefreshGrant = {
        key: code.key,
        keyId,
        userId: row.referenceId,
        clientId: code.clientId,
        redirectUri: code.redirectUri,
        name: row.name ?? new URL(code.redirectUri).hostname,
        scope: code.scope,
        allowedModels: permissions.models ?? null,
        accountPermissions: permissions.account ?? null,
        remainingBudget: row.pollenBalance ?? null,
        expiresAt: row.expiresAt?.getTime() ?? null,
    };
    const remaining = remainingSeconds(grant.expiresAt);
    if (remaining != null && remaining < MIN_KV_TTL) return null;

    const refreshToken = generateCode(REFRESH_TOKEN_LENGTH);
    await putGrant(c.env.KV, refreshToken, grant);
    return {
        expires_in: accessTokenExpiresIn(grant.expiresAt),
        refresh_token: refreshToken,
    };
}

/**
 * RFC 6749 §6 refresh_token grant. Returns the approved key while it exists.
 * If the user deleted it (an Open WebUI user removing the "Open WebUI" key
 * from the dashboard is the common case), re-mints it with the approved
 * permissions and expiry and the budget that was left at the last refresh, so
 * the app recovers without a new consent round and without a budget reset.
 * A disabled key is left alone: that is a deliberate pause.
 */
export async function exchangeRefreshToken(
    c: Context<Env>,
    body: { refresh_token?: string; client_id?: string },
) {
    if (!body.refresh_token || !body.client_id) {
        return tokenError(
            c,
            "invalid_request",
            "refresh_token and client_id are required.",
        );
    }
    const kvKey = grantKvKey(body.refresh_token);
    const grant = (await c.env.KV.get(kvKey, "json")) as RefreshGrant | null;
    if (!grant || grant.clientId !== body.client_id) {
        return tokenError(
            c,
            "invalid_grant",
            "Refresh token unknown, expired, or issued to a different client_id.",
        );
    }
    const remaining = remainingSeconds(grant.expiresAt);
    if (remaining != null && remaining <= 0) {
        await c.env.KV.delete(kvKey);
        return tokenError(
            c,
            "invalid_grant",
            "The approved key has expired; run the authorization flow again.",
        );
    }

    const db = drizzle(c.env.DB, { schema });
    const row = await db.query.apikey.findFirst({
        where: eq(schema.apikey.id, grant.keyId),
    });
    if (row) {
        if (row.pollenBalance !== grant.remainingBudget) {
            grant.remainingBudget = row.pollenBalance ?? null;
            await putGrant(c.env.KV, body.refresh_token, grant);
        }
    } else {
        let created: Awaited<ReturnType<typeof createApiKeyForUser>>;
        try {
            created = await createApiKeyForUser({
                authClient: createAuth(c.env),
                dbBinding: c.env.DB,
                userId: grant.userId,
                name: grant.name,
                type: "secret",
                ...(remaining != null && { expiresIn: remaining }),
                allowedModels: grant.allowedModels,
                pollenBudget: grant.remainingBudget,
                accountPermissions: grant.accountPermissions,
                metadata: {
                    requestedClientId: grant.clientId,
                    redirectUri: grant.redirectUri,
                    redirectOrigin: new URL(grant.redirectUri).origin,
                },
                allowAccountKeysPermission: true,
                defaultCreatedVia: "redirect-auth",
            });
        } catch (error) {
            // The client registration no longer covers this grant (client
            // deleted, redirect removed): it can't be honored any more.
            if (error instanceof HTTPException) {
                await c.env.KV.delete(kvKey);
                return tokenError(c, "invalid_grant", error.message);
            }
            throw error;
        }
        grant.key = created.key;
        grant.keyId = created.id;
        await putGrant(c.env.KV, body.refresh_token, grant);
    }

    return c.json({
        access_token: grant.key,
        token_type: "bearer",
        expires_in: accessTokenExpiresIn(grant.expiresAt),
        refresh_token: body.refresh_token,
        ...(grant.scope != null && { scope: grant.scope }),
    });
}

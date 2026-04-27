import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HTTPException } from "hono/http-exception";
import type { createAuth } from "../auth.ts";
import { sanitizeAuthorizeAccountPermissions } from "../client/lib/authorize-config.ts";
import * as schema from "../db/schema/better-auth.ts";

export type ApiKeyType = "secret" | "publishable";

export type CallerMetadata = {
    appUrl?: string;
    redirectOrigin?: string;
    deviceUserCode?: string;
    clientId?: string;
    createdForUserId?: string;
    createdForApp?: string;
    description?: string;
};

type CreateApiKeyForUserInput = {
    authClient: ReturnType<typeof createAuth>;
    dbBinding: D1Database;
    userId: string;
    name: string;
    type: ApiKeyType;
    expiresIn?: number;
    allowedModels?: string[] | null;
    pollenBudget?: number | null;
    accountPermissions?: string[] | null;
    metadata?: CallerMetadata;
    allowAccountKeysPermission: boolean;
    defaultCreatedVia: string;
};

export function validateAppUrlFormat(appUrl: string): void {
    if (!/^[a-z][a-z0-9+\-.]*:\/\/.+/.test(appUrl)) {
        throw new HTTPException(400, {
            message: "Must be a valid URL with a scheme (e.g. https://...)",
        });
    }
}

// Caller-provided metadata is restricted to a typed allowlist. Server-controlled
// fields like keyType / createdVia / plaintextKey can never be set or overridden
// by callers, even via /api/api-keys metadata patches.
function pickCallerMetadata(
    metadata: CallerMetadata | undefined,
): Record<string, unknown> {
    if (!metadata) return {};
    const out: Record<string, unknown> = {};
    if (typeof metadata.appUrl === "string") out.appUrl = metadata.appUrl;
    if (typeof metadata.redirectOrigin === "string")
        out.redirectOrigin = metadata.redirectOrigin;
    if (typeof metadata.deviceUserCode === "string")
        out.deviceUserCode = metadata.deviceUserCode;
    if (typeof metadata.clientId === "string") out.clientId = metadata.clientId;
    if (typeof metadata.createdForUserId === "string")
        out.createdForUserId = metadata.createdForUserId;
    if (typeof metadata.createdForApp === "string")
        out.createdForApp = metadata.createdForApp;
    if (typeof metadata.description === "string")
        out.description = metadata.description;
    return out;
}

export async function createApiKeyForUser({
    authClient,
    dbBinding,
    userId,
    name,
    type,
    expiresIn,
    allowedModels,
    pollenBudget,
    accountPermissions,
    metadata,
    allowAccountKeysPermission,
    defaultCreatedVia,
}: CreateApiKeyForUserInput) {
    const db = drizzle(dbBinding, { schema });
    const callerMetadata = pickCallerMetadata(metadata);
    if (typeof callerMetadata.appUrl === "string") {
        validateAppUrlFormat(callerMetadata.appUrl);
    }

    const sanitizedAccountPerms =
        sanitizeAuthorizeAccountPermissions(accountPermissions) ?? null;
    const safeAccountPerms = allowAccountKeysPermission
        ? sanitizedAccountPerms
        : (sanitizedAccountPerms?.filter((p) => p !== "keys") ?? null);

    const permissions: Record<string, string[]> = {};
    if (allowedModels) permissions.models = allowedModels;
    if (safeAccountPerms && safeAccountPerms.length > 0) {
        permissions.account = safeAccountPerms;
    }

    const isPublishable = type === "publishable";
    const prefix = isPublishable ? "pk" : "sk";
    const baseMetadata = {
        ...callerMetadata,
        keyType: type,
        createdVia: defaultCreatedVia,
    };

    const created = await authClient.api.createApiKey({
        body: {
            name,
            prefix,
            userId,
            ...(expiresIn != null && { expiresIn }),
            metadata: baseMetadata,
            permissions:
                Object.keys(permissions).length > 0 ? permissions : undefined,
        },
    });

    if (!created?.id || !created?.key) {
        throw new HTTPException(500, {
            message: "Failed to create API key",
        });
    }

    const finalMetadata = {
        ...baseMetadata,
        ...(isPublishable && { plaintextKey: created.key }),
    };

    const d1Updates: Partial<typeof schema.apikey.$inferInsert> = {
        metadata: JSON.stringify(finalMetadata),
    };
    if (pollenBudget != null) d1Updates.pollenBalance = pollenBudget;

    await db
        .update(schema.apikey)
        .set(d1Updates)
        .where(eq(schema.apikey.id, created.id));

    return {
        id: created.id,
        key: created.key,
        name: created.name,
        type,
        prefix,
        start: created.start,
        expiresAt: created.expiresAt,
        expiresIn,
        permissions: Object.keys(permissions).length > 0 ? permissions : null,
        pollenBudget: pollenBudget ?? null,
        metadata: finalMetadata,
    };
}

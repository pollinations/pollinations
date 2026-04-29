import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HTTPException } from "hono/http-exception";
import type { createAuth } from "../auth.ts";
import { sanitizeAuthorizeAccountPermissions } from "../client/lib/authorize-config.ts";
import * as schema from "../db/schema/better-auth.ts";
import { getRedirectUris, parseMetadata } from "./metadata-utils.ts";
import { redirectUriMatchesAllowlist } from "./url-utils.ts";

export type ApiKeyType = "secret" | "publishable";

export type CallerMetadata = {
    redirectUris?: string[];
    redirectUri?: string;
    redirectOrigin?: string;
    deviceUserCode?: string;
    requestedClientId?: string;
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

export function validateRedirectUriFormat(redirectUri: string): void {
    if (!/^[a-z][a-z0-9+\-.]*:\/\/.+/.test(redirectUri)) {
        throw new HTTPException(400, {
            message: "Must be a valid URL with a scheme (e.g. https://...)",
        });
    }
    let parsed: URL;
    try {
        parsed = new URL(redirectUri);
    } catch {
        throw new HTTPException(400, {
            message: "Must be a valid URL with a scheme (e.g. https://...)",
        });
    }
    if (parsed.hash) {
        throw new HTTPException(400, {
            message: "Redirect URI must not include a fragment",
        });
    }
}

function cleanRedirectUris(redirectUris: string[]): string[] {
    return redirectUris
        .map((uri) => uri.trim())
        .filter((uri): uri is string => uri.length > 0);
}

function rejectInvalidClientId(): never {
    throw new HTTPException(400, {
        message: "Invalid client_id",
    });
}

// Caller-provided metadata is restricted to a typed allowlist. Server-controlled
// fields like keyType / createdVia / plaintextKey can never be set or overridden
// by callers, even via /api/api-keys metadata patches.
function pickCallerMetadata(
    metadata: CallerMetadata | undefined,
): Record<string, unknown> {
    if (!metadata) return {};
    const out: Record<string, unknown> = {};
    if (Array.isArray(metadata.redirectUris)) {
        out.redirectUris = cleanRedirectUris(metadata.redirectUris);
    }
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

async function validateClientRedirectBinding(
    authClient: ReturnType<typeof createAuth>,
    db: ReturnType<typeof drizzle<typeof schema>>,
    metadata: CallerMetadata | undefined,
): Promise<void> {
    if (!metadata) return;
    const requestedClientId = metadata.requestedClientId;
    const storedClientId = metadata.clientId;
    if (
        typeof requestedClientId !== "string" &&
        typeof storedClientId !== "string"
    ) {
        return;
    }

    if (
        typeof requestedClientId !== "string" ||
        !requestedClientId.startsWith("pk_")
    ) {
        rejectInvalidClientId();
    }

    const result = await authClient.api.verifyApiKey({
        body: { key: requestedClientId },
    });
    if (!result.valid || !result.key?.id) {
        rejectInvalidClientId();
    }
    const clientKeyId = result.key.id;
    if (typeof storedClientId === "string" && storedClientId !== clientKeyId) {
        throw new HTTPException(400, {
            message: "client_id mismatch",
        });
    }

    const clientKey = await db.query.apikey.findFirst({
        where: eq(schema.apikey.id, clientKeyId),
    });
    if (!clientKey || clientKey.prefix !== "pk") {
        rejectInvalidClientId();
    }

    if (typeof metadata.deviceUserCode === "string") {
        const device = await db.query.deviceCode.findFirst({
            where: eq(
                schema.deviceCode.userCode,
                metadata.deviceUserCode.toUpperCase(),
            ),
        });
        if (
            !device ||
            device.status !== "pending" ||
            device.expiresAt < new Date() ||
            device.clientId !== requestedClientId
        ) {
            throw new HTTPException(400, {
                message: "client_id mismatch",
            });
        }
        return;
    }

    if (typeof metadata.redirectUri !== "string") {
        throw new HTTPException(400, {
            message: "redirect_uri is required when client_id is provided",
        });
    }
    validateRedirectUriFormat(metadata.redirectUri);

    const allowlist = getRedirectUris(parseMetadata(clientKey.metadata));
    if (!redirectUriMatchesAllowlist(metadata.redirectUri, allowlist)) {
        throw new HTTPException(400, {
            message: "redirect_uri not in allowlist for this client_id",
        });
    }
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
    await validateClientRedirectBinding(authClient, db, metadata);

    const callerMetadata = pickCallerMetadata(metadata);
    if (Array.isArray(callerMetadata.redirectUris)) {
        for (const uri of callerMetadata.redirectUris as string[]) {
            validateRedirectUriFormat(uri);
        }
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

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HTTPException } from "hono/http-exception";
import * as schema from "../db/better-auth.ts";
import { sanitizeAuthorizeAccountPermissions } from "./authorize-config.ts";
import {
    createOAuthClientForUser,
    findOAuthClientByClientId,
    isOAuthClientMetadata,
} from "./oauth-client.ts";
import { redirectUriMatchesAllowlist } from "./redirect-uri.ts";

export type ApiKeyType = "secret" | "publishable";

export type CallerMetadata = {
    redirectUris?: string[];
    redirectUri?: string;
    redirectOrigin?: string;
    deviceUserCode?: string;
    requestedClientId?: string;
    description?: string;
    earningsEnabled?: boolean;
};

type CreateApiKeyForUserInput = {
    authClient: CreateApiKeyAuthClient;
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

type CreateApiKeyAuthClient = {
    api: {
        createApiKey: (args: {
            body: {
                name: string;
                prefix: string;
                userId: string;
                expiresIn?: number;
                metadata?: Record<string, unknown>;
                permissions?: Record<string, string[]>;
            };
        }) => Promise<{
            id?: string;
            key?: string;
            name?: string | null;
            start?: string | null;
            expiresAt?: Date | null;
        }>;
        verifyApiKey: (args: { body: { key: string } }) => Promise<{
            valid: boolean;
            key?: { id?: string | null } | null;
        }>;
    };
};

type VerifiedClientAttribution = {
    oauthClientId: string;
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
// fields like keyType / createdVia / plaintextKey / app attribution can never
// be set or overridden by callers, even via /api/api-keys metadata patches.
function pickCallerMetadata(
    metadata: CallerMetadata | undefined,
    isPublishable: boolean,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (Array.isArray(metadata?.redirectUris)) {
        out.redirectUris = cleanRedirectUris(metadata.redirectUris);
    }
    if (typeof metadata?.redirectOrigin === "string")
        out.redirectOrigin = metadata.redirectOrigin;
    if (typeof metadata?.deviceUserCode === "string")
        out.deviceUserCode = metadata.deviceUserCode;
    if (typeof metadata?.description === "string")
        out.description = metadata.description;
    if (isPublishable) {
        out.earningsEnabled = metadata?.earningsEnabled === true;
    }
    return out;
}

async function validateClientRedirectBinding(
    db: ReturnType<typeof drizzle<typeof schema>>,
    metadata: CallerMetadata | undefined,
): Promise<VerifiedClientAttribution | null> {
    if (!metadata) return null;
    const requestedClientId = metadata.requestedClientId;

    if (typeof (metadata as Record<string, unknown>).clientId === "string") {
        rejectInvalidClientId();
    }

    if (typeof requestedClientId !== "string") {
        return null;
    }

    if (typeof metadata.deviceUserCode === "string") {
        throw new HTTPException(400, {
            message: "client_id is not supported for device authorization",
        });
    }

    if (
        !requestedClientId.startsWith("app_") &&
        !requestedClientId.startsWith("pk_")
    ) {
        rejectInvalidClientId();
    }

    const oauthClient = await findOAuthClientByClientId(db, requestedClientId);
    if (!oauthClient?.userId) {
        rejectInvalidClientId();
    }
    const attribution = {
        oauthClientId: oauthClient.id,
    };

    if (typeof metadata.redirectUri !== "string") {
        throw new HTTPException(400, {
            message: "redirect_uri is required when client_id is provided",
        });
    }
    validateRedirectUriFormat(metadata.redirectUri);

    if (
        !redirectUriMatchesAllowlist(
            metadata.redirectUri,
            oauthClient.redirectUris,
        )
    ) {
        throw new HTTPException(400, {
            message: "redirect_uri not in allowlist for this client_id",
        });
    }
    return attribution;
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
    const attribution = await validateClientRedirectBinding(db, metadata);

    const isPublishable = type === "publishable";
    const callerMetadata = pickCallerMetadata(metadata, isPublishable);
    if (Array.isArray(callerMetadata.redirectUris)) {
        for (const uri of callerMetadata.redirectUris as string[]) {
            validateRedirectUriFormat(uri);
        }
    }

    if (isPublishable && isOAuthClientMetadata(callerMetadata)) {
        return createOAuthClientForUser({
            dbBinding,
            userId,
            name,
            redirectUris: callerMetadata.redirectUris as string[] | undefined,
            description: callerMetadata.description as string | undefined,
            earningsEnabled: callerMetadata.earningsEnabled === true,
        });
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
    if (!isPublishable && attribution) {
        d1Updates.oauthClientId = attribution.oauthClientId;
    }

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
        oauthClientId:
            !isPublishable && attribution ? attribution.oauthClientId : null,
        metadata: finalMetadata,
    };
}

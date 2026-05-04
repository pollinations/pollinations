import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HTTPException } from "hono/http-exception";
import * as schema from "../db/better-auth.ts";
import { sanitizeAuthorizeAccountPermissions } from "./authorize-config.ts";

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
    clientId: string;
    createdForUserId: string;
    createdForApp: string;
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

function parseMetadata(
    raw: string | null | undefined,
): Record<string, unknown> {
    if (!raw) return {};
    try {
        let parsed = JSON.parse(raw);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function getRedirectUris(meta: Record<string, unknown>): string[] {
    const list = meta.redirectUris;
    if (Array.isArray(list)) {
        return list.filter((v): v is string => typeof v === "string" && !!v);
    }
    return [];
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

function redirectUriMatchesAllowlist(
    uri: string,
    allowlist: readonly string[] | null | undefined,
): boolean {
    if (!allowlist?.length) return false;
    const incoming = safeParse(uri);
    if (!incoming) return false;
    return allowlist.some((entry) => matchesRedirectEntry(incoming, entry));
}

function matchesRedirectEntry(incoming: URL, entryUrl: string): boolean {
    const entry = safeParse(entryUrl);
    if (!entry) return false;
    if (incoming.hash || entry.hash) return false;
    if (incoming.protocol !== entry.protocol) return false;
    if (
        normalizeHostname(incoming.hostname) !==
        normalizeHostname(entry.hostname)
    ) {
        return false;
    }
    if (incoming.pathname !== entry.pathname) return false;
    if (incoming.search !== entry.search) return false;
    if (isLoopbackHostname(entry.hostname)) return true;
    return incoming.port === entry.port;
}

function safeParse(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

function normalizeHostname(hostname: string): string {
    return hostname
        .toLowerCase()
        .replace(/^\[(.*)\]$/, "$1")
        .replace(/\.$/, "");
}

function isLoopbackHostname(hostname: string): boolean {
    const h = normalizeHostname(hostname);
    if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
    if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;
    return false;
}

// Caller-provided metadata is restricted to a typed allowlist. Server-controlled
// fields like keyType / createdVia / plaintextKey / app attribution can never
// be set or overridden by callers, even via /api/api-keys metadata patches.
function pickCallerMetadata(
    metadata: CallerMetadata | undefined,
    attribution: VerifiedClientAttribution | null,
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
        out.earningsEnabled = metadata?.earningsEnabled !== false;
    }
    if (attribution) {
        out.clientId = attribution.clientId;
        out.createdForUserId = attribution.createdForUserId;
        out.createdForApp = attribution.createdForApp;
    }
    return out;
}

async function validateClientRedirectBinding(
    authClient: CreateApiKeyAuthClient,
    db: ReturnType<typeof drizzle<typeof schema>>,
    metadata: CallerMetadata | undefined,
): Promise<VerifiedClientAttribution | null> {
    if (!metadata) return null;
    const requestedClientId = metadata.requestedClientId;
    const storedClientId = metadata.clientId;

    if (
        typeof requestedClientId !== "string" &&
        typeof storedClientId !== "string"
    ) {
        return null;
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
    const attribution = {
        clientId: clientKey.id,
        createdForUserId: clientKey.userId,
        createdForApp: clientKey.name ?? "Unknown app",
    };

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
        return attribution;
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
    const attribution = await validateClientRedirectBinding(
        authClient,
        db,
        metadata,
    );

    const isPublishable = type === "publishable";
    const callerMetadata = pickCallerMetadata(
        metadata,
        attribution,
        isPublishable,
    );
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
        d1Updates.byopClientKeyId = attribution.clientId;
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
        byopClientKeyId:
            !isPublishable && attribution ? attribution.clientId : null,
        metadata: finalMetadata,
    };
}

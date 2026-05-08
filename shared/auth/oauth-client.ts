import { and, eq, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/better-auth.ts";

export type OAuthClientMetadata = {
    description?: string;
    earningsEnabled?: boolean;
    migratedFromApiKeyId?: string;
    legacyClientId?: string;
};

export type OAuthClientRow = typeof schema.oauthClient.$inferSelect;

export type OAuthClientPublic = {
    id: string;
    clientId: string;
    userId: string | null;
    name: string | null;
    disabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    redirectUris: string[];
    metadata: OAuthClientMetadata;
};

type CreateOAuthClientInput = {
    dbBinding: D1Database;
    userId: string;
    name: string;
    redirectUris?: string[];
    description?: string;
    earningsEnabled?: boolean;
    clientId?: string;
    createdAt?: Date;
};

type UpdateOAuthClientInput = {
    db: ReturnType<typeof drizzle<typeof schema>>;
    id: string;
    userId: string;
    name?: string;
    redirectUris?: string[];
    description?: string;
    earningsEnabled?: boolean;
};

const DEFAULT_SCOPES = ["profile", "usage"];
const DEFAULT_GRANT_TYPES = ["authorization_code"];
const DEFAULT_RESPONSE_TYPES = ["code"];

export function isOAuthClientMetadata(metadata: unknown): boolean {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return false;
    }
    const record = metadata as Record<string, unknown>;
    const redirectUris = record.redirectUris;
    const hasRedirectUris =
        Array.isArray(redirectUris) &&
        redirectUris.some(
            (uri) => typeof uri === "string" && uri.trim().length > 0,
        );
    return hasRedirectUris || record.earningsEnabled === true;
}

export async function createOAuthClientForUser({
    dbBinding,
    userId,
    name,
    redirectUris = [],
    description,
    earningsEnabled = false,
    clientId,
    createdAt = new Date(),
}: CreateOAuthClientInput) {
    const db = drizzle(dbBinding, { schema });
    const row = {
        id: crypto.randomUUID(),
        clientId: clientId ?? generateClientId(),
        clientSecret: null,
        disabled: false,
        skipConsent: false,
        enableEndSession: false,
        scopes: JSON.stringify(DEFAULT_SCOPES),
        userId,
        createdAt,
        updatedAt: createdAt,
        name,
        redirectUris: JSON.stringify(cleanRedirectUris(redirectUris)),
        tokenEndpointAuthMethod: "none",
        grantTypes: JSON.stringify(DEFAULT_GRANT_TYPES),
        responseTypes: JSON.stringify(DEFAULT_RESPONSE_TYPES),
        public: true,
        type: "web",
        requirePKCE: true,
        metadata: JSON.stringify({
            ...(description && { description }),
            earningsEnabled,
        }),
    } satisfies typeof schema.oauthClient.$inferInsert;

    await db.insert(schema.oauthClient).values(row);
    return oauthClientToCreatedKey(row);
}

export async function findOAuthClientByClientId(
    db: ReturnType<typeof drizzle<typeof schema>>,
    clientId: string,
): Promise<OAuthClientPublic | null> {
    const row = await db.query.oauthClient.findFirst({
        where: and(
            eq(schema.oauthClient.clientId, clientId),
            or(
                isNull(schema.oauthClient.disabled),
                eq(schema.oauthClient.disabled, false),
            ),
        ),
    });
    return row ? normalizeOAuthClient(row) : null;
}

export async function findOwnedOAuthClient(
    db: ReturnType<typeof drizzle<typeof schema>>,
    id: string,
    userId: string,
): Promise<OAuthClientPublic | null> {
    const row = await db.query.oauthClient.findFirst({
        where: and(
            eq(schema.oauthClient.id, id),
            eq(schema.oauthClient.userId, userId),
        ),
    });
    return row ? normalizeOAuthClient(row) : null;
}

export async function updateOwnedOAuthClient({
    db,
    id,
    userId,
    name,
    redirectUris,
    description,
    earningsEnabled,
}: UpdateOAuthClientInput): Promise<OAuthClientPublic> {
    const existing = await findOwnedOAuthClient(db, id, userId);
    if (!existing) {
        throw new Error("OAuth client not found");
    }

    const metadata = {
        ...existing.metadata,
        ...(description !== undefined && { description }),
        ...(earningsEnabled !== undefined && { earningsEnabled }),
    };
    const update: Partial<typeof schema.oauthClient.$inferInsert> = {
        updatedAt: new Date(),
    };
    if (name !== undefined) update.name = name;
    if (redirectUris !== undefined) {
        update.redirectUris = JSON.stringify(cleanRedirectUris(redirectUris));
    }
    if (description !== undefined || earningsEnabled !== undefined) {
        update.metadata = JSON.stringify(metadata);
    }

    await db
        .update(schema.oauthClient)
        .set(update)
        .where(eq(schema.oauthClient.id, id));

    const updated = await findOwnedOAuthClient(db, id, userId);
    if (!updated) {
        throw new Error("OAuth client not found after update");
    }
    return updated;
}

export async function deleteOwnedOAuthClientAndKeys(
    db: ReturnType<typeof drizzle<typeof schema>>,
    id: string,
    userId: string,
): Promise<boolean> {
    const existing = await findOwnedOAuthClient(db, id, userId);
    if (!existing) return false;

    await db.delete(schema.apikey).where(eq(schema.apikey.oauthClientId, id));
    await db.delete(schema.oauthClient).where(eq(schema.oauthClient.id, id));
    return true;
}

export function normalizeOAuthClient(row: OAuthClientRow): OAuthClientPublic {
    return {
        id: row.id,
        clientId: row.clientId,
        userId: row.userId ?? null,
        name: row.name ?? null,
        disabled: row.disabled === true,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        redirectUris: parseStringArray(row.redirectUris),
        metadata: parseMetadata(row.metadata),
    };
}

export function oauthClientKeyMetadata(client: {
    clientId: string;
    redirectUris?: string | string[];
    metadata?: string | OAuthClientMetadata | null;
}) {
    const redirectUris =
        typeof client.redirectUris === "string"
            ? parseStringArray(client.redirectUris)
            : (client.redirectUris ?? []);
    const metadata =
        typeof client.metadata === "string"
            ? parseMetadata(client.metadata)
            : (client.metadata ?? {});
    return {
        keyType: "publishable",
        recordType: "oauth_client",
        plaintextKey: client.clientId,
        ...(metadata.description && { description: metadata.description }),
        redirectUris,
        earningsEnabled: metadata.earningsEnabled === true,
    };
}

export function oauthClientToCreatedKey(client: {
    id: string;
    clientId: string;
    name?: string | null;
    createdAt?: Date;
    redirectUris?: string | string[];
    metadata?: string | OAuthClientMetadata | null;
}) {
    return {
        id: client.id,
        key: client.clientId,
        name: client.name ?? null,
        type: "publishable" as const,
        prefix: "app" as const,
        start: client.clientId.slice(0, 10),
        expiresAt: null,
        expiresIn: undefined,
        permissions: null,
        pollenBudget: null,
        oauthClientId: client.id,
        metadata: oauthClientKeyMetadata(client),
        createdAt: client.createdAt,
        lastRequest: null,
    };
}

export function oauthClientToListItem(client: OAuthClientPublic) {
    return {
        id: client.id,
        name: client.name,
        start: client.clientId.slice(0, 10),
        prefix: "app",
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        lastRequest: null,
        expiresAt: null,
        enabled: !client.disabled,
        permissions: null,
        metadata: oauthClientKeyMetadata(client),
        pollenBalance: null,
        oauthClientId: client.id,
    };
}

function cleanRedirectUris(redirectUris: string[]): string[] {
    return redirectUris
        .map((uri) => uri.trim())
        .filter((uri): uri is string => uri.length > 0);
}

function parseStringArray(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter((v): v is string => typeof v === "string" && !!v)
            : [];
    } catch {
        return [];
    }
}

function parseMetadata(raw: string | null | undefined): OAuthClientMetadata {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as OAuthClientMetadata)
            : {};
    } catch {
        return {};
    }
}

function generateClientId(): string {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const suffix = Array.from(bytes, (byte) => chars[byte % chars.length]).join(
        "",
    );
    return `app_${suffix}`;
}

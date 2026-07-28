import { validateRedirectUriFormat } from "@shared/auth/api-key-creation.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { getRedirectUris, parseMetadata } from "../routes/metadata-utils.ts";

const MAX_METADATA_BYTES = 5 * 1024;

type VerifyClient = {
    api: {
        verifyApiKey: (args: { body: { key: string } }) => Promise<{
            valid: boolean;
            key?: { id?: string | null } | null;
        }>;
    };
};

export type ResolvedOAuthClient = {
    clientId: string;
    appName: string;
    redirectUris: string[];
    userId?: string;
    userName?: string;
    githubUsername?: string;
    earningsEnabled: boolean;
    registeredApp: boolean;
};

const ClientMetadataSchema = z
    .object({
        client_id: z.string(),
        client_name: z.string().min(1).max(253).optional(),
        redirect_uris: z.array(z.string()).min(1).max(20),
        token_endpoint_auth_method: z.literal("none").optional(),
        client_secret: z.never().optional(),
        client_secret_expires_at: z.never().optional(),
    })
    .passthrough();

function isClientMetadataUrl(clientId: string): boolean {
    try {
        const url = new URL(clientId);
        const hostname = url.hostname.toLowerCase();
        return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            !url.hash &&
            hostname !== "localhost" &&
            !hostname.endsWith(".localhost") &&
            !hostname.endsWith(".local") &&
            !hostname.endsWith(".internal") &&
            !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) &&
            !hostname.includes(":")
        );
    } catch {
        return false;
    }
}

async function readLimitedBody(response: Response): Promise<string | null> {
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_METADATA_BYTES) {
        return null;
    }

    if (!response.body) return "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let text = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_METADATA_BYTES) {
            await reader.cancel();
            return null;
        }
        text += decoder.decode(value, { stream: true });
    }

    return text + decoder.decode();
}

async function fetchClientMetadata(
    clientId: string,
): Promise<ResolvedOAuthClient | null> {
    if (!isClientMetadataUrl(clientId)) return null;

    const response = await fetch(clientId, {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    if (!response || response.status !== 200) return null;

    const text = await readLimitedBody(response);
    if (text === null) return null;

    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return null;
    }

    const parsed = ClientMetadataSchema.safeParse(json);
    if (!parsed.success || parsed.data.client_id !== clientId) return null;

    try {
        for (const redirectUri of parsed.data.redirect_uris) {
            validateRedirectUriFormat(redirectUri);
        }
    } catch {
        return null;
    }

    return {
        clientId,
        appName: parsed.data.client_name ?? new URL(clientId).hostname,
        redirectUris: parsed.data.redirect_uris,
        earningsEnabled: false,
        registeredApp: false,
    };
}

async function resolveRegisteredClient(
    dbBinding: D1Database,
    auth: VerifyClient,
    clientId: string,
): Promise<ResolvedOAuthClient | null> {
    if (!clientId.startsWith("pk_")) return null;

    const result = await auth.api.verifyApiKey({ body: { key: clientId } });
    if (!result.valid || !result.key?.id) return null;

    const db = drizzle(dbBinding, { schema });
    const keyRow = await db.query.apikey.findFirst({
        where: eq(schema.apikey.id, result.key.id),
    });
    if (!keyRow || keyRow.prefix !== "pk") return null;

    const user = await db.query.user.findFirst({
        where: eq(schema.user.id, keyRow.userId),
    });
    const metadata = parseMetadata(keyRow.metadata);
    return {
        // Preserve the existing app-lookup response: registered clients expose
        // the stable key row id, while CIMD clients expose their URL.
        clientId: keyRow.id,
        appName: keyRow.name ?? "Pollinations app",
        redirectUris: getRedirectUris(metadata),
        userId: keyRow.userId,
        userName: user?.name,
        githubUsername: user?.githubUsername || undefined,
        earningsEnabled: metadata.earningsEnabled === true,
        registeredApp: true,
    };
}

export async function resolveOAuthClient(options: {
    db: D1Database;
    auth: VerifyClient;
    clientId: string;
}): Promise<ResolvedOAuthClient | null> {
    return options.clientId.startsWith("pk_")
        ? resolveRegisteredClient(options.db, options.auth, options.clientId)
        : fetchClientMetadata(options.clientId);
}

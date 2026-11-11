import { validateRedirectUriFormat } from "@shared/auth/api-key-creation.ts";
import { isBlockedHostname } from "@shared/community-endpoint-urls.ts";
import { readResponseText } from "@shared/response-bytes.ts";
import { z } from "zod";

// The draft recommends at most 5 KB (§8.7).
const MAX_DOCUMENT_BYTES = 5 * 1024;
const FETCH_TIMEOUT_MS = 5_000;

const ClientMetadataSchema = z.object({
    client_id: z.string(),
    // Capped so "name (host)" fits the 253-character key name.
    client_name: z.string().min(1).max(100),
    redirect_uris: z.array(z.string()).min(1),
    // The token endpoint only serves public clients (PKCE, no secret).
    token_endpoint_auth_method: z.literal("none").optional(),
});

/**
 * OAuth Client ID Metadata Document (draft-ietf-oauth-client-id-metadata-document,
 * MCP 2026-07-28): the client_id is an https URL serving the client's name
 * and redirect URIs, so MCP clients sign in without a pre-registered pk_.
 * Fetched on every use, no cache. Returns null unless the document is valid
 * and names exactly this client_id.
 */
export async function fetchClientMetadata(
    clientId: string,
): Promise<{ clientName: string; redirectUris: string[] } | null> {
    try {
        const url = new URL(clientId);
        // href equality rejects dot segments, a missing path and other
        // non-canonical spellings: client_ids compare as plain strings (§3).
        if (
            url.protocol !== "https:" ||
            url.href !== clientId ||
            url.username ||
            url.password ||
            clientId.includes("#") ||
            isBlockedHostname(url.hostname) ||
            // Our hosts serve user uploads (media.pollinations.ai), which
            // would show as a first-party host; our own apps use a pk_.
            /(^|\.)(pollinations|myceli)\.ai\.?$/.test(url.hostname)
        ) {
            return null;
        }
        const response = await fetch(clientId, {
            headers: { Accept: "application/json" },
            // §4: never follow redirects; a 3xx is just a non-200 here.
            redirect: "manual",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (response.status !== 200) return null;
        const text = await readResponseText(
            response,
            MAX_DOCUMENT_BYTES,
            () => new Error("Client metadata document too large"),
        );
        const doc = ClientMetadataSchema.parse(JSON.parse(text));
        if (doc.client_id !== clientId) return null;
        // Same scheme policy as registered apps: https, or http on loopback.
        for (const uri of doc.redirect_uris) validateRedirectUriFormat(uri);
        return { clientName: doc.client_name, redirectUris: doc.redirect_uris };
    } catch {
        return null;
    }
}

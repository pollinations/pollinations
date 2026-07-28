/**
 * Agent run tokens.
 *
 * A run token is a short-lived, signed credential handed to an agent so it can
 * make model calls on a user's behalf without ever holding that user's `sk_`.
 *
 * It is an authentication-layer concept only: a run token resolves to the same
 * identity its parent key would produce, so billing, per-key budgets and
 * attribution all work unchanged (see `authenticateApiKeyRequest`). Nothing is
 * persisted — the token carries its own claims and the parent key row supplies
 * the live budget, which also means deleting the parent key kills every run
 * token derived from it.
 */

const RUN_TOKEN_PREFIX = "ag_";
const DEFAULT_TTL_SECONDS = 900;
const MAX_TTL_SECONDS = 3600;

/**
 * Only the generation API accepts run tokens. Binding the audience is what
 * stops a leaked token being replayed against enter's billing endpoints.
 */
export const RUN_TOKEN_AUDIENCE = "gen";

export interface RunTokenPayload {
    /** Payer user id. */
    sub: string;
    /** Parent API key id — spend is attributed and charged here. */
    pk: string;
    /** Run id, unique per agent invocation. */
    run: string;
    /** Agent id, for attribution. */
    agent: string;
    /** Intended audience; always `RUN_TOKEN_AUDIENCE`. */
    aud: string;
    /** Optional model narrowing, intersected with the parent key's allowlist. */
    models?: string[];
    /** Expiry, unix seconds. */
    exp: number;
}

export function isRunToken(raw: string): boolean {
    return raw.startsWith(RUN_TOKEN_PREFIX);
}

function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );
}

/**
 * Signs a payload into `ag_<base64url(json)>.<base64url(hmac)>`.
 */
export async function signRunToken(
    payload: RunTokenPayload,
    secret: string,
): Promise<string> {
    const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const signature = await crypto.subtle.sign(
        "HMAC",
        await hmacKey(secret),
        new TextEncoder().encode(body),
    );
    return `${RUN_TOKEN_PREFIX}${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Mints a run token for one agent invocation. TTL is clamped to
 * `MAX_TTL_SECONDS`; the orchestrator re-mints if a run legitimately runs long.
 */
export async function mintRunToken(
    params: {
        userId: string;
        apiKeyId: string;
        runId: string;
        agentId: string;
        models?: string[];
        ttlSeconds?: number;
    },
    secret: string,
    now: number = Date.now(),
): Promise<string> {
    const ttl = Math.min(
        params.ttlSeconds ?? DEFAULT_TTL_SECONDS,
        MAX_TTL_SECONDS,
    );
    return signRunToken(
        {
            sub: params.userId,
            pk: params.apiKeyId,
            run: params.runId,
            agent: params.agentId,
            aud: RUN_TOKEN_AUDIENCE,
            ...(params.models ? { models: params.models } : {}),
            exp: Math.floor(now / 1000) + ttl,
        },
        secret,
    );
}

/**
 * Verifies signature and expiry. Returns null for anything malformed, tampered
 * or expired — callers treat null as "not authenticated".
 */
export async function verifyRunToken(
    token: string,
    secret: string,
    now: number = Date.now(),
): Promise<RunTokenPayload | null> {
    if (!isRunToken(token)) return null;

    const [body, signature] = token.slice(RUN_TOKEN_PREFIX.length).split(".");
    if (!body || !signature) return null;

    let valid: boolean;
    try {
        valid = await crypto.subtle.verify(
            "HMAC",
            await hmacKey(secret),
            fromBase64Url(signature),
            new TextEncoder().encode(body),
        );
    } catch {
        return null;
    }
    if (!valid) return null;

    let payload: RunTokenPayload;
    try {
        payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    } catch {
        return null;
    }

    if (
        typeof payload.sub !== "string" ||
        typeof payload.pk !== "string" ||
        typeof payload.run !== "string" ||
        typeof payload.agent !== "string" ||
        typeof payload.exp !== "number"
    ) {
        return null;
    }
    if (payload.aud !== RUN_TOKEN_AUDIENCE) return null;
    if (payload.exp * 1000 <= now) return null;

    return payload;
}

/**
 * Narrows a parent key's model allowlist by the token's.
 *
 * `undefined` means unrestricted, so it is the identity element. An empty array
 * denies every model, matching the existing `permissions.models` semantics.
 */
export function intersectModels(
    parent: string[] | undefined,
    token: string[] | undefined,
): string[] | undefined {
    if (!parent) return token;
    if (!token) return parent;
    return parent.filter((model) => token.includes(model));
}

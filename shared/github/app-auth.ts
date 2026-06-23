/**
 * GitHub App authentication for Cloudflare Workers — mints a short-lived
 * installation access token using ONLY WebCrypto (`crypto.subtle`), the crypto
 * surface available in a Worker. No Node `crypto`, no `jsonwebtoken`.
 *
 * Flow: RS256-sign a JWT with the App private key -> exchange it at
 * POST /app/installations/{id}/access_tokens -> get a ~1h installation token.
 *
 * The App private key downloaded from GitHub is PKCS#1 ("BEGIN RSA PRIVATE
 * KEY"), but `crypto.subtle.importKey('pkcs8', ...)` only accepts PKCS#8. So we
 * wrap PKCS#1 -> PKCS#8 in pure JS (`pkcs1ToPkcs8`) before importing. This is
 * the one non-obvious bit; everything else is a standard JWT.
 */

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "pollinations-github-mirror";

export type GithubAppCredentials = {
    appId: string;
    /** PEM private key. May be PKCS#1 or PKCS#8; \n may be escaped as "\\n". */
    privateKey: string;
};

type CachedToken = {
    token: string;
    /** epoch ms when the token expires (per GitHub's `expires_at`). */
    expiresAtMs: number;
    /** the installation id this token was minted for. */
    installationId: number;
};

// Module-scoped cache. Installation tokens last ~1h; we reuse one until it is
// within REFRESH_SKEW_MS of expiry. In a Worker this cache lives for the
// isolate's lifetime — good enough to avoid minting a token on every cron tick.
let cached: CachedToken | null = null;
let cachedInstallationId: number | null = null;
const REFRESH_SKEW_MS = 5 * 60 * 1000; // refresh 5 min before expiry

// ---- base64url helpers (Worker-safe: atob/btoa are global) ----

function b64urlFromBytes(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlFromString(str: string): string {
    return b64urlFromBytes(new TextEncoder().encode(str));
}

function bytesFromB64(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// ---- PEM -> DER ----

function pemToDer(pem: string): Uint8Array {
    const body = pem
        .replace(/-----BEGIN [A-Z ]+-----/, "")
        .replace(/-----END [A-Z ]+-----/, "")
        .replace(/\s+/g, "");
    return bytesFromB64(body);
}

// ---- minimal DER encoding for the PKCS#1 -> PKCS#8 wrap ----

function derLength(n: number): number[] {
    if (n < 0x80) return [n];
    const bytes: number[] = [];
    let v = n;
    while (v > 0) {
        bytes.unshift(v & 0xff);
        v >>= 8;
    }
    return [0x80 | bytes.length, ...bytes];
}

function derTLV(tag: number, content: Uint8Array): Uint8Array {
    return Uint8Array.from([tag, ...derLength(content.length), ...content]);
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
    const total = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrs) {
        out.set(a, off);
        off += a.length;
    }
    return out;
}

/**
 * Wrap a PKCS#1 RSAPrivateKey DER into a PKCS#8 PrivateKeyInfo DER so WebCrypto
 * can import it. PKCS#8 = SEQUENCE { INTEGER 0, AlgorithmIdentifier(rsaEncryption
 * + NULL), OCTET STRING (the PKCS#1 DER) }.
 */
function pkcs1ToPkcs8(pkcs1Der: Uint8Array): Uint8Array {
    const version = derTLV(0x02, Uint8Array.from([0x00]));
    const rsaOid = derTLV(
        0x06,
        Uint8Array.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]),
    );
    const nullParam = derTLV(0x05, Uint8Array.from([]));
    const algId = derTLV(0x30, concatBytes(rsaOid, nullParam));
    const privOctet = derTLV(0x04, pkcs1Der);
    return derTLV(0x30, concatBytes(version, algId, privOctet));
}

function normalizePem(privateKey: string): string {
    let pem = privateKey;
    // SOPS dotenv stores the multi-line PEM with literal \n escapes.
    if (pem.includes("\\n")) pem = pem.replace(/\\n/g, "\n");
    // strip accidental surrounding quotes
    return pem.replace(/^["']/, "").replace(/["']$/, "");
}

async function importSigningKey(privateKey: string): Promise<CryptoKey> {
    const pem = normalizePem(privateKey);
    const der = pemToDer(pem);
    const pkcs8 = /BEGIN RSA PRIVATE KEY/.test(pem) ? pkcs1ToPkcs8(der) : der;
    return crypto.subtle.importKey(
        "pkcs8",
        pkcs8 as BufferSource,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
    );
}

/** Mint a short-lived App JWT (valid ~9 min, iat backdated for clock skew). */
async function mintAppJwt(creds: GithubAppCredentials): Promise<string> {
    const key = await importSigningKey(creds.privateKey);
    const nowSec = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = { iat: nowSec - 60, exp: nowSec + 540, iss: creds.appId };
    const signingInput = `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(
        JSON.stringify(payload),
    )}`;
    const sig = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

async function appJsonGet<T>(path: string, jwt: string): Promise<T> {
    const res = await fetch(`${GITHUB_API}${path}`, {
        headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": USER_AGENT,
        },
    });
    if (!res.ok) {
        throw new Error(
            `GitHub App GET ${path} -> ${res.status}: ${await res.text()}`,
        );
    }
    return (await res.json()) as T;
}

/**
 * Resolve the installation id for the given org account (cached). We match by
 * `account.login` rather than taking the first installation, so this stays
 * correct if the App ever gains a second installation. (The repo-scoped
 * `GET /repos/{owner}/{repo}/installation` endpoint 404s for this App, so we
 * list installations and pick the org's.)
 */
async function resolveInstallationId(
    jwt: string,
    org: string,
): Promise<number> {
    if (cachedInstallationId !== null) return cachedInstallationId;
    const installations = await appJsonGet<
        Array<{ id: number; account: { login: string } | null }>
    >("/app/installations", jwt);
    const match = installations.find(
        (i) => i.account?.login?.toLowerCase() === org.toLowerCase(),
    );
    if (!match) {
        throw new Error(
            `GitHub App has no installation for org "${org}" (found: ${
                installations.map((i) => i.account?.login).join(", ") || "none"
            })`,
        );
    }
    cachedInstallationId = match.id;
    return cachedInstallationId;
}

/**
 * Get a valid installation access token, minting (and caching) a new one only
 * when none is cached or the cached one is near expiry. The returned token is
 * used as `Authorization: token <token>` against the REST and GraphQL APIs.
 */
export async function getInstallationToken(
    creds: GithubAppCredentials,
    org: string,
): Promise<string> {
    if (cached && cached.expiresAtMs - Date.now() > REFRESH_SKEW_MS) {
        return cached.token;
    }

    const jwt = await mintAppJwt(creds);
    const installationId = await resolveInstallationId(jwt, org);

    const res = await fetch(
        `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": USER_AGENT,
            },
        },
    );
    if (res.status !== 201) {
        throw new Error(
            `GitHub installation token mint -> ${res.status}: ${await res.text()}`,
        );
    }
    const body = (await res.json()) as { token: string; expires_at: string };
    cached = {
        token: body.token,
        expiresAtMs: new Date(body.expires_at).getTime(),
        installationId,
    };
    return cached.token;
}

/** Read App credentials off a Worker env. Throws if either is missing. */
export function githubAppCredentialsFromEnv(env: {
    GITHUB_APP_ID?: string;
    GITHUB_APP_PRIVATE_KEY?: string;
}): GithubAppCredentials {
    if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
        throw new Error(
            "missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY in env",
        );
    }
    return { appId: env.GITHUB_APP_ID, privateKey: env.GITHUB_APP_PRIVATE_KEY };
}

/** Test-only: reset the module token/installation cache. */
export function __resetGithubAppAuthCache(): void {
    cached = null;
    cachedInstallationId = null;
}

/** Exported only for unit tests of the PKCS#1->PKCS#8 wrap. */
export const __internal = {
    pkcs1ToPkcs8,
    pemToDer,
    normalizePem,
    b64urlFromString,
};

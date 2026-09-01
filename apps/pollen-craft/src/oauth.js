import { isSecretKey } from "./api.js";

export const OAUTH_CLIENT_ID = "pk_N9TtZeTsMP9CoPss";
export const OAUTH_AUTHORIZE_ENDPOINT =
    "https://enter.pollinations.ai/authorize";
export const OAUTH_TOKEN_ENDPOINT =
    "https://enter.pollinations.ai/api/oauth/token";
export const OAUTH_PRODUCTION_REDIRECT_URI = "https://pollen-craft.vercel.app/";
export const OAUTH_LOCAL_REDIRECT_URI = "http://localhost:4173/";
export const OAUTH_REDIRECT_URIS = Object.freeze([
    OAUTH_PRODUCTION_REDIRECT_URI,
    OAUTH_LOCAL_REDIRECT_URI,
]);

export const OAUTH_PENDING_STORAGE_KEY = "pollen-craft:oauth-pending:v1";
export const OAUTH_TOKEN_STORAGE_KEY = "pollen-craft:oauth-token";
export const OAUTH_LEGACY_KEY_STORAGE_KEY = "pollen-craft:key";
export const OAUTH_TRANSACTION_VERSION = 1;
export const OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;
export const OAUTH_RANDOM_BYTES = 32;
export const OAUTH_RANDOM_STRING_LENGTH = 43;
export const OAUTH_MAX_CALLBACK_URL_LENGTH = 8 * 1024;
export const OAUTH_MAX_CALLBACK_PARAM_LENGTH = 512;
export const OAUTH_MAX_TOKEN_RESPONSE_BYTES = 16 * 1024;
export const OAUTH_MAX_PENDING_BYTES = 4 * 1024;
export const OAUTH_MAX_EXPIRES_IN_SECONDS = 31_536_000;

const AUTH_PARAM_NAMES = Object.freeze([
    "code",
    "state",
    "error",
    "error_description",
    "error_uri",
]);

export const OAUTH_ERROR_MESSAGES = Object.freeze({
    OAUTH_ORIGIN_UNSUPPORTED:
        "Wallet connection is unavailable on this app address.",
    OAUTH_STORAGE_UNAVAILABLE:
        "Wallet connection could not access this browser tab.",
    OAUTH_PENDING_INVALID:
        "The wallet connection could not be resumed. Connect again.",
    OAUTH_PENDING_EXPIRED: "The wallet connection expired. Connect again.",
    OAUTH_CALLBACK_INVALID: "The wallet callback was invalid. Connect again.",
    OAUTH_REDIRECT_MISMATCH:
        "The wallet callback did not match this app. Connect again.",
    OAUTH_NO_PENDING: "No pending wallet connection was found. Connect again.",
    OAUTH_STATE_MISMATCH:
        "The wallet callback could not be verified. Connect again.",
    OAUTH_ACCESS_DENIED: "Wallet connection was cancelled.",
    OAUTH_INVALID_REQUEST:
        "Pollinations rejected the wallet connection request.",
    OAUTH_UNAUTHORIZED_CLIENT:
        "Pollinations rejected this app's wallet connection.",
    OAUTH_UNSUPPORTED_RESPONSE_TYPE:
        "Pollinations rejected the wallet connection response type.",
    OAUTH_INVALID_SCOPE: "Pollinations rejected the wallet permissions.",
    OAUTH_SERVER_ERROR:
        "Pollinations could not complete the wallet connection.",
    OAUTH_TEMPORARILY_UNAVAILABLE:
        "Pollinations wallet connection is temporarily unavailable.",
    OAUTH_AUTH_ERROR: "Pollinations did not approve the wallet connection.",
    OAUTH_TOKEN_NETWORK:
        "The wallet connection could not reach Pollinations. Try again.",
    OAUTH_TOKEN_HTTP: "Pollinations rejected the wallet connection. Try again.",
    OAUTH_TOKEN_MALFORMED:
        "Pollinations returned an unreadable wallet response. Try again.",
    OAUTH_TOKEN_INVALID:
        "Pollinations returned an invalid wallet token. Try again.",
    OAUTH_TOKEN_STORAGE:
        "The wallet token could not be saved in this tab. Try again.",
});

export class OAuthError extends Error {
    constructor(code) {
        const safeCode = Object.hasOwn(OAUTH_ERROR_MESSAGES, code)
            ? code
            : "OAUTH_CALLBACK_INVALID";
        super(OAUTH_ERROR_MESSAGES[safeCode]);
        this.name = "OAuthError";
        this.code = safeCode;
    }
}

const oauthError = (code) => new OAuthError(code);

function readStorage(storage, key) {
    if (!storage || typeof storage.getItem !== "function")
        throw oauthError("OAUTH_STORAGE_UNAVAILABLE");
    try {
        return storage.getItem(key);
    } catch {
        throw oauthError("OAUTH_STORAGE_UNAVAILABLE");
    }
}

function writeStorage(storage, key, value) {
    if (!storage || typeof storage.setItem !== "function")
        throw oauthError("OAUTH_STORAGE_UNAVAILABLE");
    try {
        storage.setItem(key, value);
    } catch {
        throw oauthError("OAUTH_STORAGE_UNAVAILABLE");
    }
}

function removeStorage(storage, key) {
    if (!storage || typeof storage.removeItem !== "function") return;
    try {
        storage.removeItem(key);
    } catch {
        // A blocked storage area is already empty from this app's perspective.
    }
}

export function initializeOAuthStorage(storage) {
    removeStorage(storage, OAUTH_LEGACY_KEY_STORAGE_KEY);
}

function removeStorageStrict(storage, key) {
    if (!storage || typeof storage.removeItem !== "function") return false;
    try {
        storage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

function nowValue(now) {
    try {
        const value = typeof now === "function" ? now() : (now ?? Date.now());
        return Number.isFinite(value) ? Math.floor(value) : Date.now();
    } catch {
        return Date.now();
    }
}

function isBoundedString(value, max = OAUTH_MAX_CALLBACK_PARAM_LENGTH) {
    return typeof value === "string" && value.length > 0 && value.length <= max;
}

function resolveCrypto(cryptoImpl) {
    const source = cryptoImpl ?? globalThis.crypto;
    if (!source || typeof source.getRandomValues !== "function")
        throw oauthError("OAUTH_CALLBACK_INVALID");
    return source;
}

function resolveSubtleCrypto(cryptoImpl) {
    const source = cryptoImpl ?? globalThis.crypto;
    if (!source.subtle || typeof source.subtle.digest !== "function")
        throw oauthError("OAUTH_CALLBACK_INVALID");
    return source;
}

function toBase64Url(bytes) {
    if (typeof globalThis.btoa !== "function")
        throw oauthError("OAUTH_CALLBACK_INVALID");
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return globalThis
        .btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
}

export function base64UrlEncode(bytes) {
    if (!(bytes instanceof Uint8Array)) throw new TypeError("Expected bytes.");
    return toBase64Url(bytes);
}

export function isRandomValue(value) {
    return (
        typeof value === "string" &&
        value.length === OAUTH_RANDOM_STRING_LENGTH &&
        /^[A-Za-z0-9_-]+$/u.test(value)
    );
}

export function createRandomValue(cryptoImpl = globalThis.crypto) {
    const bytes = new Uint8Array(OAUTH_RANDOM_BYTES);
    try {
        resolveCrypto(cryptoImpl).getRandomValues(bytes);
        return toBase64Url(bytes);
    } catch (error) {
        if (error instanceof OAuthError) throw error;
        throw oauthError("OAUTH_CALLBACK_INVALID");
    }
}

export const createRandomString = createRandomValue;

export async function createPkceChallenge(
    verifier,
    cryptoImpl = globalThis.crypto,
) {
    if (!isRandomValue(verifier)) throw oauthError("OAUTH_CALLBACK_INVALID");
    try {
        const digest = await resolveSubtleCrypto(cryptoImpl).subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
        );
        const bytes = new Uint8Array(digest);
        if (bytes.byteLength !== OAUTH_RANDOM_BYTES)
            throw oauthError("OAUTH_CALLBACK_INVALID");
        return toBase64Url(bytes);
    } catch (error) {
        if (error instanceof OAuthError) throw error;
        throw oauthError("OAUTH_CALLBACK_INVALID");
    }
}

export const createCodeChallenge = createPkceChallenge;

function locationToUrl(locationLike) {
    if (locationLike instanceof URL) return new URL(locationLike.href);
    if (typeof locationLike === "string") return new URL(locationLike);
    if (typeof locationLike?.href === "string")
        return new URL(locationLike.href);
    if (typeof locationLike?.origin !== "string")
        throw new TypeError("Missing location.");
    return new URL(
        `${locationLike.origin}${locationLike.pathname || "/"}${locationLike.search || ""}${locationLike.hash || ""}`,
    );
}

function exactOriginPath(url) {
    return `${url.origin}${url.pathname}`;
}

export function redirectUriForLocation(locationLike = globalThis.location) {
    let url;
    try {
        url = locationToUrl(locationLike);
    } catch {
        throw oauthError("OAUTH_ORIGIN_UNSUPPORTED");
    }
    const redirectUri = OAUTH_REDIRECT_URIS.find(
        (candidate) => candidate === exactOriginPath(url),
    );
    if (!redirectUri) throw oauthError("OAUTH_ORIGIN_UNSUPPORTED");
    return redirectUri;
}

export const getRedirectUri = redirectUriForLocation;

function isValidPendingShape(record) {
    return (
        record &&
        typeof record === "object" &&
        !Array.isArray(record) &&
        record.version === OAUTH_TRANSACTION_VERSION &&
        isRandomValue(record.state) &&
        isRandomValue(record.verifier) &&
        (record.codeChallenge === undefined ||
            isRandomValue(record.codeChallenge)) &&
        OAUTH_REDIRECT_URIS.includes(record.redirectUri) &&
        record.clientId === OAUTH_CLIENT_ID &&
        Number.isSafeInteger(record.createdAt) &&
        record.createdAt >= 0
    );
}

export function validatePendingTransaction(record, now = Date.now()) {
    if (!isValidPendingShape(record))
        return { valid: false, code: "OAUTH_PENDING_INVALID" };
    const currentTime = nowValue(now);
    if (record.createdAt > currentTime)
        return { valid: false, code: "OAUTH_PENDING_INVALID" };
    if (currentTime - record.createdAt >= OAUTH_PENDING_TTL_MS)
        return { valid: false, code: "OAUTH_PENDING_EXPIRED" };
    return { valid: true, code: null };
}

function pendingResult(storage, now, clearInvalid) {
    const raw = readStorage(storage, OAUTH_PENDING_STORAGE_KEY);
    if (raw === null || raw === undefined || raw === "")
        return { record: null, code: null };
    if (typeof raw !== "string" || raw.length > OAUTH_MAX_PENDING_BYTES) {
        if (clearInvalid) removeStorage(storage, OAUTH_PENDING_STORAGE_KEY);
        return { record: null, code: "OAUTH_PENDING_INVALID" };
    }
    let record;
    try {
        record = JSON.parse(raw);
    } catch {
        if (clearInvalid) removeStorage(storage, OAUTH_PENDING_STORAGE_KEY);
        return { record: null, code: "OAUTH_PENDING_INVALID" };
    }
    const validation = validatePendingTransaction(record, now);
    if (!validation.valid) {
        if (clearInvalid) removeStorage(storage, OAUTH_PENDING_STORAGE_KEY);
        return { record: null, code: validation.code };
    }
    return { record, code: null };
}

export function readPendingTransaction(
    storage,
    now = Date.now(),
    { clearInvalid = true } = {},
) {
    return pendingResult(storage, now, clearInvalid).record;
}

export const readPending = readPendingTransaction;

export function savePendingTransaction(storage, record) {
    if (!isValidPendingShape(record)) throw oauthError("OAUTH_PENDING_INVALID");
    writeStorage(
        storage,
        OAUTH_PENDING_STORAGE_KEY,
        JSON.stringify({
            version: record.version,
            state: record.state,
            verifier: record.verifier,
            ...(record.codeChallenge
                ? { codeChallenge: record.codeChallenge }
                : {}),
            redirectUri: record.redirectUri,
            clientId: record.clientId,
            createdAt: record.createdAt,
        }),
    );
    return record;
}

export const savePending = savePendingTransaction;

export function buildAuthorizationUrl(
    transaction,
    authorizeEndpoint = OAUTH_AUTHORIZE_ENDPOINT,
) {
    if (
        !isValidPendingShape(transaction) ||
        !isRandomValue(transaction.codeChallenge)
    )
        throw oauthError("OAUTH_PENDING_INVALID");
    try {
        const url = new URL(authorizeEndpoint);
        url.search = new URLSearchParams([
            ["response_type", "code"],
            ["client_id", transaction.clientId],
            ["redirect_uri", transaction.redirectUri],
            ["state", transaction.state],
            ["code_challenge", transaction.codeChallenge],
            ["code_challenge_method", "S256"],
        ]).toString();
        url.hash = "";
        return url.toString();
    } catch {
        throw oauthError("OAUTH_CALLBACK_INVALID");
    }
}

export const createAuthorizationUrl = buildAuthorizationUrl;

export async function beginOAuth({
    storage,
    location = globalThis.location,
    cryptoImpl = globalThis.crypto,
    now = Date.now,
    authorizeEndpoint = OAUTH_AUTHORIZE_ENDPOINT,
} = {}) {
    const redirectUri = redirectUriForLocation(location);
    const currentTime = nowValue(now);
    const existing = pendingResult(storage, currentTime, true).record;
    if (existing?.redirectUri === redirectUri) {
        const codeChallenge =
            existing.codeChallenge ??
            (await createPkceChallenge(existing.verifier, cryptoImpl));
        const transaction = { ...existing, codeChallenge };
        if (!existing.codeChallenge)
            savePendingTransaction(storage, transaction);
        return {
            authorizationUrl: buildAuthorizationUrl(
                transaction,
                authorizeEndpoint,
            ),
            transaction,
            reused: true,
        };
    }
    if (existing) removeStorage(storage, OAUTH_PENDING_STORAGE_KEY);
    const transaction = {
        version: OAUTH_TRANSACTION_VERSION,
        state: createRandomValue(cryptoImpl),
        verifier: createRandomValue(cryptoImpl),
        redirectUri,
        clientId: OAUTH_CLIENT_ID,
        createdAt: currentTime,
    };
    transaction.codeChallenge = await createPkceChallenge(
        transaction.verifier,
        cryptoImpl,
    );
    savePendingTransaction(storage, transaction);
    return {
        authorizationUrl: buildAuthorizationUrl(transaction, authorizeEndpoint),
        transaction,
        reused: false,
    };
}

export const startOAuth = beginOAuth;

function hashQueryParts(hash) {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw) return null;
    const questionIndex = raw.indexOf("?");
    if (questionIndex < 0) {
        const params = new URLSearchParams(raw);
        return AUTH_PARAM_NAMES.some((name) => params.has(name))
            ? { prefix: "", params }
            : null;
    }
    return {
        prefix: raw.slice(0, questionIndex),
        params: new URLSearchParams(raw.slice(questionIndex + 1)),
    };
}

function callbackParamEntries(url) {
    const entries = [];
    const append = (params) => {
        for (const name of AUTH_PARAM_NAMES)
            for (const value of params.getAll(name))
                entries.push({ name, value });
    };
    append(url.searchParams);
    const hashParts = hashQueryParts(url.hash);
    if (hashParts) append(hashParts.params);
    return entries;
}

function deleteAuthParams(params) {
    for (const name of AUTH_PARAM_NAMES) params.delete(name);
}

export function cleanCallbackUrl(locationLike) {
    const url = locationToUrl(locationLike);
    deleteAuthParams(url.searchParams);
    const hashParts = hashQueryParts(url.hash);
    if (hashParts) {
        deleteAuthParams(hashParts.params);
        const remaining = hashParts.params.toString();
        url.hash = remaining
            ? `#${hashParts.prefix}?${remaining}`
            : hashParts.prefix
              ? `#${hashParts.prefix}`
              : "";
    }
    return `${url.pathname}${url.search}${url.hash}`;
}

export const scrubCallbackUrl = cleanCallbackUrl;

function safeCleanCallbackUrl(locationLike) {
    try {
        return cleanCallbackUrl(locationLike);
    } catch {
        return null;
    }
}

export function parseOAuthCallback(locationLike) {
    let url;
    try {
        url = locationToUrl(locationLike);
    } catch {
        return {
            kind: "invalid",
            cleanedUrl: null,
            error: oauthError("OAUTH_CALLBACK_INVALID"),
        };
    }
    const cleanedUrl = safeCleanCallbackUrl(url);
    const entries = callbackParamEntries(url);
    if (!entries.length) return { kind: "none", cleanedUrl: null };
    if (
        url.href.length > OAUTH_MAX_CALLBACK_URL_LENGTH ||
        entries.some(
            ({ value }) =>
                value.length === 0 ||
                value.length > OAUTH_MAX_CALLBACK_PARAM_LENGTH,
        )
    )
        return {
            kind: "invalid",
            cleanedUrl,
            error: oauthError("OAUTH_CALLBACK_INVALID"),
        };
    const values = new Map();
    for (const { name, value } of entries) {
        const list = values.get(name) ?? [];
        list.push(value);
        values.set(name, list);
    }
    const states = values.get("state") ?? [];
    const codes = values.get("code") ?? [];
    const errors = values.get("error") ?? [];
    const descriptions = values.get("error_description") ?? [];
    const uris = values.get("error_uri") ?? [];
    const validShape =
        states.length === 1 &&
        codes.length + errors.length === 1 &&
        codes.length <= 1 &&
        errors.length <= 1 &&
        (codes.length === 0 ||
            (descriptions.length === 0 && uris.length === 0)) &&
        descriptions.length <= 1 &&
        uris.length <= 1;
    if (!validShape)
        return {
            kind: "invalid",
            cleanedUrl,
            error: oauthError("OAUTH_CALLBACK_INVALID"),
        };
    if (codes.length === 1)
        return {
            kind: "code",
            code: codes[0],
            state: states[0],
            cleanedUrl,
        };
    return {
        kind: "error",
        errorCode: callbackErrorCode(errors[0]),
        state: states[0],
        cleanedUrl,
    };
}

export const parseCallback = parseOAuthCallback;

export function constantTimeEqual(left, right) {
    if (typeof left !== "string" || typeof right !== "string") return false;
    const length = Math.max(left.length, right.length);
    let difference = left.length ^ right.length;
    for (let index = 0; index < length; index++)
        difference |=
            (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
    return difference === 0;
}

function callbackErrorCode(error) {
    return (
        {
            access_denied: "OAUTH_ACCESS_DENIED",
            invalid_request: "OAUTH_INVALID_REQUEST",
            unauthorized_client: "OAUTH_UNAUTHORIZED_CLIENT",
            unsupported_response_type: "OAUTH_UNSUPPORTED_RESPONSE_TYPE",
            invalid_scope: "OAUTH_INVALID_SCOPE",
            server_error: "OAUTH_SERVER_ERROR",
            temporarily_unavailable: "OAUTH_TEMPORARILY_UNAVAILABLE",
        }[error] ?? "OAUTH_AUTH_ERROR"
    );
}

async function readBoundedResponseText(response) {
    const declaredLength = Number(response.headers?.get?.("content-length"));
    if (
        Number.isFinite(declaredLength) &&
        declaredLength > OAUTH_MAX_TOKEN_RESPONSE_BYTES
    )
        throw oauthError("OAUTH_TOKEN_MALFORMED");
    if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks = [];
        let total = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk =
                    value instanceof Uint8Array ? value : new Uint8Array(value);
                total += chunk.byteLength;
                if (total > OAUTH_MAX_TOKEN_RESPONSE_BYTES) {
                    await reader.cancel();
                    throw oauthError("OAUTH_TOKEN_MALFORMED");
                }
                chunks.push(chunk);
            }
        } catch (error) {
            if (error instanceof OAuthError) throw error;
            throw oauthError("OAUTH_TOKEN_MALFORMED");
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        try {
            return new TextDecoder().decode(bytes);
        } catch {
            throw oauthError("OAUTH_TOKEN_MALFORMED");
        }
    }
    if (typeof response.text !== "function")
        throw oauthError("OAUTH_TOKEN_MALFORMED");
    try {
        const text = await response.text();
        if (
            new TextEncoder().encode(text).byteLength >
            OAUTH_MAX_TOKEN_RESPONSE_BYTES
        )
            throw oauthError("OAUTH_TOKEN_MALFORMED");
        return text;
    } catch (error) {
        if (error instanceof OAuthError) throw error;
        throw oauthError("OAUTH_TOKEN_MALFORMED");
    }
}

export function parseOAuthTokenResponse(payload, now = Date.now()) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw oauthError("OAUTH_TOKEN_INVALID");
    if (!isSecretKey(payload.access_token))
        throw oauthError("OAUTH_TOKEN_INVALID");
    if (
        typeof payload.token_type !== "string" ||
        payload.token_type.toLowerCase() !== "bearer"
    )
        throw oauthError("OAUTH_TOKEN_INVALID");
    let expiresAt = null;
    if (Object.hasOwn(payload, "expires_in")) {
        if (
            !Number.isSafeInteger(payload.expires_in) ||
            payload.expires_in <= 0 ||
            payload.expires_in > OAUTH_MAX_EXPIRES_IN_SECONDS
        )
            throw oauthError("OAUTH_TOKEN_INVALID");
        expiresAt = nowValue(now) + payload.expires_in * 1000;
        if (!Number.isSafeInteger(expiresAt))
            throw oauthError("OAUTH_TOKEN_INVALID");
    }
    return { token: payload.access_token.trim(), expiresAt };
}

async function exchangeAuthorizationCode({
    fetchImpl,
    transaction,
    code,
    tokenEndpoint = OAUTH_TOKEN_ENDPOINT,
    now = Date.now,
}) {
    if (typeof fetchImpl !== "function")
        throw oauthError("OAUTH_TOKEN_NETWORK");
    if (!isValidPendingShape(transaction) || !isBoundedString(code))
        throw oauthError("OAUTH_CALLBACK_INVALID");
    const body = new URLSearchParams([
        ["grant_type", "authorization_code"],
        ["code", code],
        ["client_id", transaction.clientId],
        ["redirect_uri", transaction.redirectUri],
        ["code_verifier", transaction.verifier],
    ]).toString();
    let response;
    try {
        response = await fetchImpl(tokenEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body,
            credentials: "omit",
        });
    } catch {
        throw oauthError("OAUTH_TOKEN_NETWORK");
    }
    if (!response || typeof response !== "object")
        throw oauthError("OAUTH_TOKEN_NETWORK");
    const status = response.status;
    if (
        response.ok === false ||
        (status !== undefined && (status < 200 || status >= 300))
    )
        throw oauthError("OAUTH_TOKEN_HTTP");
    try {
        return parseOAuthTokenResponse(
            JSON.parse(await readBoundedResponseText(response)),
            now,
        );
    } catch (error) {
        if (error instanceof OAuthError) throw error;
        throw oauthError("OAUTH_TOKEN_MALFORMED");
    }
}

export const exchangeCode = exchangeAuthorizationCode;

export function readOAuthToken(storage, now = Date.now) {
    const raw = readStorage(storage, OAUTH_TOKEN_STORAGE_KEY);
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw !== "string" || raw.length > OAUTH_MAX_PENDING_BYTES) {
        removeStorage(storage, OAUTH_TOKEN_STORAGE_KEY);
        return null;
    }
    let record;
    try {
        record = JSON.parse(raw);
    } catch {
        removeStorage(storage, OAUTH_TOKEN_STORAGE_KEY);
        return null;
    }
    const valid =
        record &&
        typeof record === "object" &&
        !Array.isArray(record) &&
        isSecretKey(record.token) &&
        (record.expiresAt === null ||
            (Number.isSafeInteger(record.expiresAt) && record.expiresAt > 0));
    if (!valid) {
        removeStorage(storage, OAUTH_TOKEN_STORAGE_KEY);
        return null;
    }
    const currentTime = nowValue(now);
    if (record.expiresAt !== null && record.expiresAt <= currentTime) {
        removeStorage(storage, OAUTH_TOKEN_STORAGE_KEY);
        return null;
    }
    return { token: record.token.trim(), expiresAt: record.expiresAt };
}

export const readToken = readOAuthToken;

export function saveOAuthToken(storage, tokenRecord) {
    const valid =
        tokenRecord &&
        typeof tokenRecord === "object" &&
        !Array.isArray(tokenRecord) &&
        isSecretKey(tokenRecord.token) &&
        (tokenRecord.expiresAt === null ||
            (Number.isSafeInteger(tokenRecord.expiresAt) &&
                tokenRecord.expiresAt > 0));
    if (!valid) throw oauthError("OAUTH_TOKEN_INVALID");
    const record = {
        token: tokenRecord.token.trim(),
        expiresAt: tokenRecord.expiresAt,
    };
    try {
        writeStorage(storage, OAUTH_TOKEN_STORAGE_KEY, JSON.stringify(record));
        removeStorage(storage, OAUTH_LEGACY_KEY_STORAGE_KEY);
    } catch (error) {
        if (
            error instanceof OAuthError &&
            error.code === "OAUTH_STORAGE_UNAVAILABLE"
        )
            throw oauthError("OAUTH_TOKEN_STORAGE");
        throw error instanceof OAuthError
            ? error
            : oauthError("OAUTH_TOKEN_STORAGE");
    }
    return record;
}

export const saveToken = saveOAuthToken;

export function disconnectOAuth(storage) {
    removeStorage(storage, OAUTH_TOKEN_STORAGE_KEY);
    removeStorage(storage, OAUTH_PENDING_STORAGE_KEY);
    removeStorage(storage, OAUTH_LEGACY_KEY_STORAGE_KEY);
}

export const disconnect = disconnectOAuth;

export async function handleOAuthCallback({
    storage,
    location = globalThis.location,
    history = globalThis.history,
    fetchImpl = globalThis.fetch,
    now = Date.now,
    tokenEndpoint = OAUTH_TOKEN_ENDPOINT,
} = {}) {
    let parsed;
    try {
        parsed = parseOAuthCallback(location);
    } catch {
        parsed = {
            kind: "invalid",
            cleanedUrl: null,
            error: oauthError("OAUTH_CALLBACK_INVALID"),
        };
    }
    const cleanedUrl = parsed.cleanedUrl;
    if (cleanedUrl) {
        try {
            history?.replaceState?.({}, "", cleanedUrl);
        } catch {
            // URL cleanup is best effort; validation still runs.
        }
    }
    if (parsed.kind === "none") return parsed;
    if (parsed.kind === "invalid")
        return { kind: "failure", cleanedUrl, error: parsed.error };

    let callbackRedirectUri;
    try {
        callbackRedirectUri = redirectUriForLocation(location);
    } catch {
        return {
            kind: "failure",
            cleanedUrl,
            error: oauthError("OAUTH_ORIGIN_UNSUPPORTED"),
        };
    }
    let pending;
    let pendingCode = null;
    try {
        const result = pendingResult(storage, nowValue(now), true);
        pending = result.record;
        pendingCode = result.code;
    } catch (error) {
        return {
            kind: "failure",
            cleanedUrl,
            error:
                error instanceof OAuthError
                    ? error
                    : oauthError("OAUTH_STORAGE_UNAVAILABLE"),
        };
    }
    if (!pending)
        return {
            kind: "failure",
            cleanedUrl,
            error: oauthError(pendingCode ?? "OAUTH_NO_PENDING"),
        };
    if (callbackRedirectUri !== pending.redirectUri)
        return {
            kind: "failure",
            cleanedUrl,
            error: oauthError("OAUTH_REDIRECT_MISMATCH"),
        };
    if (!constantTimeEqual(parsed.state, pending.state))
        return {
            kind: "failure",
            cleanedUrl,
            error: oauthError("OAUTH_STATE_MISMATCH"),
        };
    if (!removeStorageStrict(storage, OAUTH_PENDING_STORAGE_KEY))
        return {
            kind: "failure",
            cleanedUrl,
            error: oauthError("OAUTH_STORAGE_UNAVAILABLE"),
        };
    if (parsed.kind === "error")
        return {
            kind: "failure",
            cleanedUrl,
            error: oauthError(parsed.errorCode),
        };
    try {
        const tokenRecord = await exchangeAuthorizationCode({
            fetchImpl,
            transaction: pending,
            code: parsed.code,
            tokenEndpoint,
            now,
        });
        saveOAuthToken(storage, tokenRecord);
        return {
            kind: "success",
            cleanedUrl,
            expiresAt: tokenRecord.expiresAt,
        };
    } catch (error) {
        return {
            kind: "failure",
            cleanedUrl,
            error:
                error instanceof OAuthError
                    ? error
                    : oauthError("OAUTH_TOKEN_NETWORK"),
        };
    }
}

export const consumeOAuthCallback = handleOAuthCallback;

export function createOAuthClient({
    storage = globalThis.sessionStorage,
    getLocation = () => globalThis.location,
    getHistory = () => globalThis.history,
    fetchImpl = globalThis.fetch,
    cryptoImpl = globalThis.crypto,
    now = Date.now,
} = {}) {
    return {
        getRedirectUri: () => redirectUriForLocation(getLocation()),
        getToken: () => readOAuthToken(storage, now),
        begin: () =>
            beginOAuth({
                storage,
                location: getLocation(),
                cryptoImpl,
                now,
            }),
        handleCallback: () =>
            handleOAuthCallback({
                storage,
                location: getLocation(),
                history: getHistory(),
                fetchImpl,
                now,
            }),
        disconnect: () => disconnectOAuth(storage),
    };
}

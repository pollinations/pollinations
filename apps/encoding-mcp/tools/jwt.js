import { z } from "zod";

const HMAC_ALGORITHMS = {
    HS256: "SHA-256",
    HS384: "SHA-384",
    HS512: "SHA-512",
};

function decodeSegment(segment, name) {
    if (!/^[A-Za-z0-9_-]*$/.test(segment))
        throw new Error(`${name} is not base64url`);
    const padded = segment.padEnd(
        segment.length + ((4 - (segment.length % 4)) % 4),
        "=",
    );
    const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    try {
        return JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
    } catch {
        throw new Error(`${name} is not valid JSON`);
    }
}

function decodeBase64Url(segment) {
    const padded = segment.padEnd(
        segment.length + ((4 - (segment.length % 4)) % 4),
        "=",
    );
    const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(bytes) {
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function sameBytes(a, b) {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let index = 0; index < a.length; index += 1)
        difference |= a[index] ^ b[index];
    return difference === 0;
}

// Numeric Date claims are seconds; report both the raw value and a reading a
// human (or a model) can use without doing the arithmetic itself.
function numericDate(value, now) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const date = new Date(value * 1000);
    if (Number.isNaN(date.getTime())) return null;
    return {
        epochSeconds: value,
        iso: date.toISOString(),
        secondsFromNow: Math.round(value - now.getTime() / 1000),
    };
}

async function inspectJwt({ token, secret }) {
    const parts = token.trim().split(".");
    if (parts.length !== 3)
        throw new Error(
            `A JWT has three dot-separated segments, this has ${parts.length}`,
        );
    const header = decodeSegment(parts[0], "header");
    const payload = decodeSegment(parts[1], "payload");
    const now = new Date();
    const result = {
        header,
        payload,
        algorithm: header.alg ?? null,
        type: header.typ ?? null,
        keyId: header.kid ?? null,
        claims: {
            issuer: payload.iss ?? null,
            subject: payload.sub ?? null,
            audience: payload.aud ?? null,
            issuedAt: numericDate(payload.iat, now),
            notBefore: numericDate(payload.nbf, now),
            expiresAt: numericDate(payload.exp, now),
        },
    };
    // Only HMAC needs the secret on hand; RS/ES/PS would need the issuer keys,
    // so the tool reports that instead of pretending the token is unverified.
    if (secret === undefined) {
        result.signature = "not checked; pass secret to verify an HS token";
        return result;
    }
    const hash = HMAC_ALGORITHMS[header.alg];
    if (!hash)
        throw new Error(
            `Cannot verify "${header.alg}" with a shared secret; supported: ${Object.keys(HMAC_ALGORITHMS).join(", ")}`,
        );
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash },
        false,
        ["sign"],
    );
    const expected = await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    let actual;
    try {
        actual = decodeBase64Url(parts[2]);
    } catch {
        throw new Error("Signature is not base64url");
    }
    result.signature = "checked";
    result.validSignature = sameBytes(new Uint8Array(expected), actual);
    if (result.validSignature) {
        const expired = result.claims.expiresAt?.secondsFromNow;
        result.expired = expired === undefined ? null : expired < 0;
    } else {
        // A wrong signature makes every other conclusion meaningless.
        result.expired = null;
    }
    return result;
}

export const jwtTools = [
    [
        "jwt_inspect",
        "Read a JWT's header and payload with expiry, not-before and issued-at as dates, and verify an HS256/384/512 signature when given the secret. Never claims a signature is valid unless it checked it.",
        {
            token: z
                .string()
                .min(1)
                .max(20000)
                .describe("The compact JWT, with or without a Bearer prefix"),
            secret: z
                .string()
                .max(4096)
                .optional()
                .describe("HMAC secret; omit to decode without verifying"),
        },
        ({ token, secret }) =>
            inspectJwt({ token: token.replace(/^Bearer\s+/i, ""), secret }),
    ],
    [
        "jwt_sign",
        "Create an HS256/384/512 JWT from a claims object, for test fixtures and local debugging.",
        {
            claims: z
                .record(z.string(), z.unknown())
                .describe(
                    "Payload claims; add exp, iat or nbf as epoch seconds",
                ),
            secret: z.string().min(1).max(4096).describe("HMAC secret"),
            algorithm: z.enum(["HS256", "HS384", "HS512"]).default("HS256"),
            keyId: z.string().max(200).optional().describe("Sets header kid"),
        },
        async ({ claims, secret, algorithm, keyId }) => {
            const header = {
                alg: algorithm,
                typ: "JWT",
                ...(keyId === undefined ? {} : { kid: keyId }),
            };
            const encode = (value) =>
                toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
            const body = `${encode(header)}.${encode(claims)}`;
            const cryptoKey = await crypto.subtle.importKey(
                "raw",
                new TextEncoder().encode(secret),
                { name: "HMAC", hash: HMAC_ALGORITHMS[algorithm] },
                false,
                ["sign"],
            );
            const signature = new Uint8Array(
                await crypto.subtle.sign(
                    "HMAC",
                    cryptoKey,
                    new TextEncoder().encode(body),
                ),
            );
            const token = `${body}.${toBase64Url(signature)}`;
            return { token, algorithm, byteLength: token.length };
        },
    ],
];

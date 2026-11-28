import { z } from "zod";

function decodeBase64UrlJson(segment, label) {
    if (!segment || !/^[A-Za-z0-9_-]+$/.test(segment)) {
        throw new Error(`Invalid JWT ${label} encoding`);
    }
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`JWT ${label} must decode to a JSON object`);
    }
    return parsed;
}

function toIso(epochSeconds) {
    return typeof epochSeconds === "number" && Number.isFinite(epochSeconds)
        ? new Date(epochSeconds * 1000).toISOString()
        : null;
}

export const jwtTools = [
    [
        "decode_jwt",
        "Decode a JSON Web Token (JWT) header and payload locally without verifying its signature. Formats iat/exp/nbf timestamps and checks expiry.",
        {
            token: z
                .string()
                .min(5)
                .max(16384)
                .describe("JWT string (header.payload.signature)"),
            now_epoch_seconds: z
                .number()
                .finite()
                .optional()
                .describe("Optional Unix epoch seconds for deterministic expiry check"),
        },
        ({ token, now_epoch_seconds }) => {
            const cleaned = token.trim().replace(/^Bearer\s+/i, "");
            const parts = cleaned.split(".");
            if (parts.length !== 3) {
                throw new Error("JWT must have exactly three dot-separated segments");
            }
            const [headerSeg, payloadSeg, sigSeg] = parts;
            const header = decodeBase64UrlJson(headerSeg, "header");
            const payload = decodeBase64UrlJson(payloadSeg, "payload");
            const nowSec =
                now_epoch_seconds ?? Math.floor(Date.now() / 1000);

            const exp = typeof payload.exp === "number" ? payload.exp : null;
            const nbf = typeof payload.nbf === "number" ? payload.nbf : null;
            const iat = typeof payload.iat === "number" ? payload.iat : null;

            return {
                header,
                payload,
                has_signature: sigSeg.length > 0,
                timestamps: {
                    iat_iso: toIso(iat),
                    nbf_iso: toIso(nbf),
                    exp_iso: toIso(exp),
                },
                expired: exp !== null ? nowSec >= exp : null,
                not_before_active: nbf !== null ? nowSec >= nbf : null,
            };
        },
    ],
];

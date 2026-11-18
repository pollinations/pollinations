import { z } from "zod";

// A JWT is three base64url parts. Decoding is not verification: this tool takes no
// secret, never checks a signature, and says so in the result.
function decodePart(segment, part) {
    if (segment === "") throw new Error(`JWT ${part} is empty.`);
    if (!/^[A-Za-z0-9_-]+$/.test(segment))
        throw new Error(`JWT ${part} is not base64url.`);
    let parsed;
    try {
        parsed = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    } catch {
        throw new Error(`JWT ${part} is not valid JSON.`);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        throw new Error(`JWT ${part} must be a JSON object.`);
    return parsed;
}

function dateClaim(payload, name) {
    const value = payload[name];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const jwtTools = [
    [
        "jwt_decode",
        "Decode a JSON Web Token's header and payload WITHOUT verifying it: the signature is never checked and no secret is accepted, so the result is UNVERIFIED and must not be trusted for access control. Returns the header, the payload, and exp/nbf/iat as ISO dates when present.",
        {
            token: z
                .string()
                .min(1)
                .max(8192)
                .describe(
                    "The JWT to decode: three base64url parts separated by dots.",
                ),
        },
        ({ token }) => {
            const raw = typeof token === "string" ? token.trim() : "";
            if (raw === "") throw new Error("JWT token is empty.");
            const parts = raw.split(".");
            if (parts.length !== 3)
                throw new Error(
                    `JWT must have three parts separated by dots, got ${parts.length}.`,
                );
            const header = decodePart(parts[0], "header");
            const payload = decodePart(parts[1], "payload");
            return {
                header,
                payload,
                verified: false,
                note: "Decoding only — the signature was not verified.",
                signature_present: parts[2] !== "",
                expires_at: dateClaim(payload, "exp"),
                not_before_at: dateClaim(payload, "nbf"),
                issued_at: dateClaim(payload, "iat"),
            };
        },
    ],
];

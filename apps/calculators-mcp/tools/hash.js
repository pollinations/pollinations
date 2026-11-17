import { z } from "zod";

// Web Crypto digest names. SHA-1 is offered for checksum compatibility; prefer SHA-256 or stronger for security.
const algorithms = {
    sha1: "SHA-1",
    sha256: "SHA-256",
    sha384: "SHA-384",
    sha512: "SHA-512",
};
export const hashTools = [
    [
        "hash_text",
        "Compute a cryptographic digest of text with Web Crypto, locally. Returns the digest as lowercase hex and base64; no network or model calls. SHA-1 is only for checksum compatibility.",
        {
            text: z
                .string()
                .min(1)
                .max(100000)
                .describe("Text to hash; encoded as UTF-8"),
            algorithm: z
                .enum(["sha1", "sha256", "sha384", "sha512"])
                .default("sha256"),
        },
        async ({ text, algorithm }) => {
            const digest = new Uint8Array(
                await crypto.subtle.digest(
                    algorithms[algorithm],
                    new TextEncoder().encode(text),
                ),
            );
            return {
                algorithm,
                hex: [...digest]
                    .map((byte) => byte.toString(16).padStart(2, "0"))
                    .join(""),
                base64: btoa(String.fromCharCode(...digest)),
                bytes: digest.length,
            };
        },
    ],
];

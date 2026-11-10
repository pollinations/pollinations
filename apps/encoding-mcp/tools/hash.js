import { z } from "zod";

// Web Crypto names, so no dependency and no Node Buffer in the Worker.
const ALGORITHMS = {
    sha1: "SHA-1",
    sha256: "SHA-256",
    sha384: "SHA-384",
    sha512: "SHA-512",
};
const OUTPUT = z.enum(["hex", "base64", "base64url"]);

function toBase64(bytes, url = false) {
    const value = btoa(
        Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""),
    );
    return url
        ? value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
        : value;
}

function encodeDigest(bytes, encoding) {
    if (encoding !== "hex") return toBase64(bytes, encoding === "base64url");
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
        "",
    );
}

// Constant-time compare, used when the caller supplies a digest to check.
function sameDigest(a, b) {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let index = 0; index < a.length; index += 1)
        difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
    return difference === 0;
}

async function digest({ text, algorithm, key, encoding = "hex", expected }) {
    const name = ALGORITHMS[algorithm];
    if (!name) throw new Error(`Unsupported algorithm "${algorithm}"`);
    const data = new TextEncoder().encode(text);
    let bytes;
    if (key === undefined) {
        bytes = new Uint8Array(await crypto.subtle.digest(name, data));
    } else {
        const cryptoKey = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(key),
            { name: "HMAC", hash: name },
            false,
            ["sign"],
        );
        bytes = new Uint8Array(
            await crypto.subtle.sign("HMAC", cryptoKey, data),
        );
    }
    const value = encodeDigest(bytes, encoding);
    return {
        algorithm,
        hmac: key !== undefined,
        encoding,
        digest: value,
        byteLength: data.length,
        ...(expected === undefined
            ? {}
            : {
                  matches: sameDigest(
                      value,
                      encoding === "hex"
                          ? expected.trim().toLowerCase()
                          : expected.trim(),
                  ),
              }),
    };
}

export const hashTools = [
    [
        "hash_text",
        "Hash or HMAC text with SHA-1/256/384/512, in hex, base64 or base64url. Pass expected to check a candidate digest in constant time.",
        {
            text: z.string().max(100000).describe("Text to hash"),
            algorithm: z
                .enum(["sha1", "sha256", "sha384", "sha512"])
                .default("sha256"),
            key: z
                .string()
                .max(4096)
                .optional()
                .describe("HMAC key; omit for a plain digest"),
            encoding: OUTPUT.default("hex"),
            expected: z
                .string()
                .max(200)
                .optional()
                .describe(
                    "Digest to compare against; adds matches to the result",
                ),
        },
        digest,
    ],
];

import { z } from "zod";

function utf8ToBase64(text, urlSafe = false) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    let encoded = btoa(binary);
    if (urlSafe) {
        encoded = encoded
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }
    return {
        inputLength: text.length,
        byteLength: bytes.byteLength,
        encoded,
        urlSafe,
    };
}

function base64ToUtf8(base64Text) {
    let normalized = base64Text.trim();
    // Check if URL-safe base64
    if (/^[A-Za-z0-9_-]+$/.test(normalized)) {
        normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");
        while (normalized.length % 4 !== 0) {
            normalized += "=";
        }
    }

    try {
        const binary = atob(normalized);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return {
            byteLength: bytes.byteLength,
            decoded,
        };
    } catch {
        throw new Error(
            "Invalid Base64 string or malformed UTF-8 byte sequence in decoded data",
        );
    }
}

export const base64Tools = [
    [
        "base64_encode",
        "Encode UTF-8 text into standard or URL-safe Base64 string locally without network calls.",
        {
            text: z
                .string()
                .min(1)
                .max(100_000)
                .describe(
                    "Text string to encode into Base64 (up to 100,000 characters)",
                ),
            url_safe: z
                .boolean()
                .default(false)
                .describe(
                    "Whether to use URL-safe Base64 alphabet (- and _ without padding)",
                ),
        },
        ({ text, url_safe }) => utf8ToBase64(text, url_safe),
    ],
    [
        "base64_decode",
        "Decode a standard or URL-safe Base64 string back into UTF-8 text locally without network calls.",
        {
            encoded: z
                .string()
                .min(1)
                .max(150_000)
                .describe("Base64 string to decode back to UTF-8 text"),
        },
        ({ encoded }) => base64ToUtf8(encoded),
    ],
];

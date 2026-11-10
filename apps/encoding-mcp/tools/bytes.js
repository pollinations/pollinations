import { z } from "zod";

// Tool design: the caller says what the bytes already are and what they want
// back, so one pair of tools covers text, base64, hex and percent-encoding
// instead of one tool per combination.
const encoding = z.enum(["text", "base64", "base64url", "hex", "url", "html"]);

function decodeBase64(value, url = false) {
    const normalized = url
        ? value.replace(/-/g, "+").replace(/_/g, "/")
        : value.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized))
        throw new Error("Input is not valid base64");
    const padded = normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4)) % 4),
        "=",
    );
    let binary;
    try {
        binary = atob(padded);
    } catch {
        throw new Error("Input is not valid base64");
    }
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64(bytes, url = false) {
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
        "",
    );
    const value = btoa(binary);
    return url
        ? value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
        : value;
}

const ENTITIES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};
const NAMED = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": "\u00a0",
};

function bytesOf(value, from) {
    switch (from) {
        case "text":
            return new TextEncoder().encode(value);
        case "base64":
            return decodeBase64(value);
        case "base64url":
            return decodeBase64(value, true);
        case "hex": {
            const clean = value.replace(/\s+/g, "");
            if (!/^(?:[0-9a-fA-F]{2})*$/.test(clean))
                throw new Error("Input is not valid hex");
            return Uint8Array.from(clean.match(/../g) ?? [], (pair) =>
                Number.parseInt(pair, 16),
            );
        }
        case "url":
            // An invalid escape such as %zz is an error, not literal text.
            if (/%(?![0-9a-fA-F]{2})/.test(value))
                throw new Error("Input has an invalid percent-escape");
            return new TextEncoder().encode(decodeURIComponent(value));
        case "html": {
            const decoded = value.replace(
                /&(?:amp|lt|gt|quot|apos|nbsp|#39|#\d{1,6}|#x[0-9a-fA-F]{1,5});/g,
                (entity) => {
                    if (NAMED[entity]) return NAMED[entity];
                    const numeric = entity.startsWith("&#x")
                        ? Number.parseInt(entity.slice(3, -1), 16)
                        : Number.parseInt(entity.slice(2, -1), 10);
                    if (numeric > 0x10ffff)
                        throw new Error(
                            "Numeric entity is out of Unicode range",
                        );
                    return String.fromCodePoint(numeric);
                },
            );
            return new TextEncoder().encode(decoded);
        }
        default:
            throw new Error(`Unknown input encoding "${from}"`);
    }
}

function textOf(bytes, to) {
    switch (to) {
        case "text":
            // Fatal decoding: lossy round trips are the usual base64 bug.
            return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        case "base64":
            return toBase64(bytes);
        case "base64url":
            return toBase64(bytes, true);
        case "hex":
            return Array.from(bytes, (byte) =>
                byte.toString(16).padStart(2, "0"),
            ).join("");
        case "url":
            return encodeURIComponent(textOf(bytes, "text"));
        case "html":
            return textOf(bytes, "text").replace(
                /[&<>"']/g,
                (char) => ENTITIES[char],
            );
        default:
            throw new Error(`Unknown output encoding "${to}"`);
    }
}

function convert({ value, from = "text", to = "text" }) {
    const bytes = bytesOf(value, from);
    try {
        return {
            from,
            to,
            value: textOf(bytes, to),
            byteLength: bytes.length,
        };
    } catch (error) {
        if (error instanceof TypeError)
            throw new Error(
                `Decoded bytes are not valid UTF-8 (byteLength ${bytes.length})`,
            );
        throw error;
    }
}

export const bytesTools = [
    [
        "encoding_convert",
        "Convert between text, base64, base64url, hex, percent-encoding and HTML entities. Decoding rejects malformed input and invalid UTF-8 instead of guessing.",
        {
            value: z
                .string()
                .max(100000)
                .describe("The value to convert, in the `from` encoding"),
            from: encoding.default("text").describe("Encoding of value"),
            to: encoding.default("text").describe("Encoding to return"),
        },
        convert,
    ],
    [
        "data_uri_build",
        "Wrap base64 data in a data: URI, or take a data: URI apart into its media type and bytes.",
        {
            mode: z.enum(["build", "parse"]).default("parse"),
            value: z
                .string()
                .max(100000)
                .describe("Base64 data for build, the data: URI for parse"),
            mediaType: z
                .string()
                .max(100)
                .default("application/octet-stream")
                .describe("Media type used by build"),
        },
        ({ mode, value, mediaType }) => {
            if (mode === "build")
                return {
                    mediaType,
                    uri: `data:${mediaType};base64,${toBase64(bytesOf(value, "base64"))}`,
                };
            const match =
                /^data:([^;,]+)?((?:;[^;,]+)*?)(;base64)?,(.*)$/s.exec(value);
            if (!match) throw new Error("Not a data: URI");
            const [, type = "text/plain", params, base64, data] = match;
            const bytes = base64
                ? decodeBase64(data)
                : new TextEncoder().encode(decodeURIComponent(data));
            return {
                mediaType: `${type}${params}`,
                base64: Boolean(base64),
                byteLength: bytes.length,
                text: textOf(bytes, "text"),
            };
        },
    ],
];

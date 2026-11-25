import { z } from "zod";

const HTML_ESCAPE = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

const HTML_UNESCAPE = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&#x27;": "'",
};

function toBase64(text, urlSafe) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary);
    return urlSafe
        ? b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
        : b64;
}

function fromBase64(input, urlSafe) {
    let b64 = input.trim();
    if (urlSafe) {
        b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
        throw new Error("Invalid base64 input");
    }
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export const encodingTools = [
    [
        "transform_encoding",
        "Encode or decode text locally using base64, base64url, url (percent-encoding), or html entities.",
        {
            text: z.string().max(100000).describe("Input text to encode or decode"),
            format: z
                .enum(["base64", "base64url", "url", "html"])
                .describe("Encoding format"),
            direction: z
                .enum(["encode", "decode"])
                .describe("Whether to encode or decode"),
        },
        ({ text, format, direction }) => {
            let output;
            if (format === "base64") {
                output =
                    direction === "encode"
                        ? toBase64(text, false)
                        : fromBase64(text, false);
            } else if (format === "base64url") {
                output =
                    direction === "encode"
                        ? toBase64(text, true)
                        : fromBase64(text, true);
            } else if (format === "url") {
                output =
                    direction === "encode"
                        ? encodeURIComponent(text)
                        : decodeURIComponent(text);
            } else {
                output =
                    direction === "encode"
                        ? text.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch])
                        : text.replace(
                              /&(?:amp|lt|gt|quot|#39|#x27);/g,
                              (ent) => HTML_UNESCAPE[ent] ?? ent,
                          );
            }

            return {
                format,
                direction,
                output,
                length: output.length,
            };
        },
    ],
];

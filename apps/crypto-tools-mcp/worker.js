import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

// Pure compute: hashing, UUIDs, base64, secure tokens, HMAC. No model calls,
// no external services, nothing billed beyond the caller's own key check.

function hex(buffer) {
    return [...new Uint8Array(buffer)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function toBase64(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function fromBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// Compact MD5 (RFC 1321). Web Crypto does not provide MD5.
function md5(input) {
    const bytes = new TextEncoder().encode(input);
    // Pre-processing
    const bitLen = bytes.length * 8;
    const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, bitLen >>> 0, true);
    view.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), true);

    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;

    const S = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    const K = [];
    for (let i = 0; i < 64; i++) {
        K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
    }

    for (let offset = 0; offset < padded.length; offset += 64) {
        const M = [];
        for (let i = 0; i < 16; i++) {
            M[i] = view.getUint32(offset + i * 4, true);
        }
        let A = a;
        let B = b;
        let C = c;
        let D = d;
        for (let i = 0; i < 64; i++) {
            let F;
            let g;
            if (i < 16) {
                F = (B & C) | (~B & D);
                g = i;
            } else if (i < 32) {
                F = (D & B) | (~D & C);
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                F = B ^ C ^ D;
                g = (3 * i + 5) % 16;
            } else {
                F = C ^ (B | ~D);
                g = (7 * i) % 16;
            }
            F = (F + A + K[i] + M[g]) >>> 0;
            A = D;
            D = C;
            C = B;
            B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
        }
        a = (a + A) >>> 0;
        b = (b + B) >>> 0;
        c = (c + C) >>> 0;
        d = (d + D) >>> 0;
    }

    const out = new Uint8Array(16);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, a, true);
    dv.setUint32(4, b, true);
    dv.setUint32(8, c, true);
    dv.setUint32(12, d, true);
    return [...out].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function shaDigest(text, algorithm) {
    if (algorithm === "md5") return md5(text);
    const name =
        algorithm === "sha1"
            ? "SHA-1"
            : algorithm === "sha256"
              ? "SHA-256"
              : "SHA-512";
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest(name, data);
    return hex(buf);
}

async function hmacDigest(text, secret, algorithm) {
    const hashName = algorithm === "sha256" ? "SHA-256" : "SHA-512";
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: hashName },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
    return hex(sig);
}

function buildServer() {
    const server = new McpServer(
        { name: "crypto-tools-mcp", title: "Crypto Tools MCP", version: "1.0.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "hash_text",
        {
            description:
                "Computes a cryptographic hash of the input text using SHA-256, SHA-512, SHA-1, or MD5.",
            inputSchema: z.object({
                text: z.string(),
                algorithm: z
                    .enum(["sha256", "sha512", "sha1", "md5"])
                    .optional()
                    .default("sha256"),
            }),
        },
        async ({ text, algorithm = "sha256" }) => {
            const hash = await shaDigest(text, algorithm);
            return createMCPResponse([
                createTextContent(hash),
            ]);
        },
    );

    server.registerTool(
        "generate_uuid",
        {
            description: "Generates a cryptographically random RFC 4122 version 4 UUID.",
            inputSchema: z.object({}),
        },
        async () => {
            return createMCPResponse([createTextContent(crypto.randomUUID())]);
        },
    );

    server.registerTool(
        "base64_transform",
        {
            description: "Encodes or decodes text to/from Base64 (UTF-8 safe).",
            inputSchema: z.object({
                text: z.string(),
                action: z.enum(["encode", "decode"]).optional().default("encode"),
            }),
        },
        async ({ text, action = "encode" }) => {
            if (action === "encode") {
                const bytes = new TextEncoder().encode(text);
                return createMCPResponse([createTextContent(toBase64(bytes))]);
            }
            if (action === "decode") {
                const bytes = fromBase64(text);
                return createMCPResponse([createTextContent(new TextDecoder().decode(bytes))]);
            }
            throw new Error(`Invalid action: ${action}`);
        },
    );

    server.registerTool(
        "generate_secure_token",
        {
            description:
                "Generates a cryptographically secure random token in hex, base64, or alphanumeric format.",
            inputSchema: z.object({
                bytes: z.number().int().min(1).max(256).optional().default(32),
                format: z
                    .enum(["hex", "base64", "alphanumeric"])
                    .optional()
                    .default("hex"),
            }),
        },
        async ({ bytes = 32, format = "hex" }) => {
            const buf = new Uint8Array(bytes);
            crypto.getRandomValues(buf);
            let token;
            if (format === "hex") {
                token = [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
            } else if (format === "base64") {
                token = toBase64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
            } else if (format === "alphanumeric") {
                const chars =
                    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                token = Array.from(buf)
                    .map((b) => chars[b % chars.length])
                    .join("");
            } else {
                throw new Error(`Invalid format: ${format}`);
            }
            return createMCPResponse([createTextContent(token)]);
        },
    );

    server.registerTool(
        "calculate_hmac",
        {
            description: "Calculates an HMAC signature for a message given a secret key.",
            inputSchema: z.object({
                text: z.string(),
                secret: z.string(),
                algorithm: z.enum(["sha256", "sha512"]).optional().default("sha256"),
            }),
        },
        async ({ text, secret, algorithm = "sha256" }) => {
            const hmac = await hmacDigest(text, secret, algorithm);
            return createMCPResponse([createTextContent(hmac)]);
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate": 'Bearer realm="crypto-tools-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                status: "ok",
                service: "crypto-tools-mcp",
                endpoint: "/",
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};

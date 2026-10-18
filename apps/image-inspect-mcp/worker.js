import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const BODY_CAP = 10485760;
const PNG_COLOR_TYPES = {
    0: "grayscale",
    2: "rgb",
    3: "palette",
    4: "grayscale-alpha",
    6: "rgba",
};
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];

function requireHttpUrl(input) {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(
            `Only http and https URLs are supported, got "${url.protocol}".`,
        );
    }
    return url;
}

function startsWith(bytes, sequence) {
    return sequence.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes, start, end) {
    return String.fromCharCode(...bytes.subarray(start, end));
}

function u16le(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32le(bytes, offset) {
    return (
        (bytes[offset] |
            (bytes[offset + 1] << 8) |
            (bytes[offset + 2] << 16) |
            (bytes[offset + 3] << 24)) >>>
        0
    );
}

function s32le(bytes, offset) {
    return (
        bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    );
}

function u16be(bytes, offset) {
    return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32be(bytes, offset) {
    return (
        ((bytes[offset] << 24) |
            (bytes[offset + 1] << 16) |
            (bytes[offset + 2] << 8) |
            bytes[offset + 3]) >>>
        0
    );
}

// Read at most `cap` bytes so a huge response cannot exhaust the worker;
// `truncated` reports when reading ran over the cap.
async function fetchBytes(input, cap = BODY_CAP) {
    try {
        const response = await fetch(input);
        const status = response.status;
        const contentType = response.headers.get("content-type");
        const etag = response.headers.get("etag");
        const xCache = response.headers.get("x-cache");
        const lastModified = response.headers.get("last-modified");
        const reader = response.body?.getReader();
        if (!response.ok || !reader) {
            await response.body?.cancel().catch(() => {});
            return {
                status,
                bytes: new Uint8Array(0),
                truncated: false,
                contentType,
                etag,
                xCache,
                lastModified,
            };
        }
        const chunks = [];
        let size = 0;
        let truncated = false;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            size += value.byteLength;
            if (size >= cap) {
                truncated = true;
                await reader.cancel().catch(() => {});
                break;
            }
        }
        const merged = new Uint8Array(Math.min(size, cap));
        let offset = 0;
        for (const chunk of chunks) {
            const room = merged.byteLength - offset;
            if (room <= 0) break;
            merged.set(chunk.subarray(0, room), offset);
            offset += room;
        }
        return {
            status,
            bytes: merged,
            truncated,
            contentType,
            etag,
            xCache,
            lastModified,
        };
    } catch (error) {
        return {
            status: null,
            bytes: new Uint8Array(0),
            truncated: false,
            contentType: null,
            etag: null,
            xCache: null,
            lastModified: null,
            error: String(error?.message ?? error),
        };
    }
}

function decodeDataUri(input) {
    const match = /^data:([^,]*),([\s\S]*)$/.exec(input);
    if (!match?.[1]?.toLowerCase().includes(";base64")) {
        throw new Error("Only base64 data URIs are supported.");
    }
    let binary;
    try {
        binary = atob(match[2].replace(/\s/g, ""));
    } catch {
        throw new Error("Data URI payload is not valid base64.");
    }
    if (binary.length > BODY_CAP) {
        throw new Error("Data URI exceeds the 10 MB inspection cap.");
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function parsePng(bytes) {
    if (
        bytes.length < 29 ||
        !startsWith(bytes, PNG_SIGNATURE) ||
        ascii(bytes, 12, 16) !== "IHDR"
    ) {
        return null;
    }
    const colorType = bytes[25];
    return {
        format: "png",
        width: u32be(bytes, 16),
        height: u32be(bytes, 20),
        details: {
            bitDepth: bytes[24],
            colorType: PNG_COLOR_TYPES[colorType] ?? `unknown(${colorType})`,
            interlaced: bytes[28] === 1,
        },
    };
}

function parseJpeg(bytes) {
    if (bytes.length < 4 || !startsWith(bytes, [0xff, 0xd8, 0xff])) {
        return null;
    }
    let pos = 2;
    while (pos + 1 < bytes.length) {
        if (bytes[pos] !== 0xff) {
            pos++;
            continue;
        }
        const marker = bytes[pos + 1];
        if (marker === 0xff) {
            pos++;
            continue;
        }
        // Standalone markers carry no length field.
        if (
            marker === 0xd8 ||
            marker === 0x01 ||
            (marker >= 0xd0 && marker <= 0xd7)
        ) {
            pos += 2;
            continue;
        }
        // Stop at end-of-image or the scan start when no frame header exists.
        if (marker === 0xd9 || marker === 0xda) break;
        const length = u16be(bytes, pos + 2);
        if (!length || pos + 2 + length > bytes.length) break;
        const isFrameHeader =
            marker >= 0xc0 &&
            marker <= 0xcf &&
            marker !== 0xc4 &&
            marker !== 0xc8 &&
            marker !== 0xcc;
        if (isFrameHeader) {
            return {
                format: "jpeg",
                width: u16be(bytes, pos + 7),
                height: u16be(bytes, pos + 5),
                details: {
                    progressive: marker !== 0xc0 && marker !== 0xc1,
                    precision: bytes[pos + 4],
                    components: bytes[pos + 9],
                },
            };
        }
        pos += 2 + length;
    }
    return { format: "jpeg", width: null, height: null, details: {} };
}

function parseGif(bytes) {
    if (bytes.length < 13 || ascii(bytes, 0, 3) !== "GIF") return null;
    const version = ascii(bytes, 3, 6);
    if (version !== "87a" && version !== "89a") return null;
    const packed = bytes[10];
    const hasGlobalColorTable = (packed & 0x80) !== 0;
    return {
        format: "gif",
        width: u16le(bytes, 6),
        height: u16le(bytes, 8),
        details: {
            version,
            hasGlobalColorTable,
            globalColorTableSize: hasGlobalColorTable
                ? 2 << (packed & 0x07)
                : 0,
        },
    };
}

function parseWebp(bytes) {
    if (
        bytes.length < 16 ||
        !startsWith(bytes, RIFF_SIGNATURE) ||
        ascii(bytes, 8, 12) !== "WEBP"
    ) {
        return null;
    }
    const chunk = ascii(bytes, 12, 16);
    if (chunk === "VP8 " && bytes.length >= 30) {
        return {
            format: "webp",
            width: u16le(bytes, 26) & 0x3fff,
            height: u16le(bytes, 28) & 0x3fff,
            details: { flavor: "lossy" },
        };
    }
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
        return {
            format: "webp",
            width: (bytes[21] | ((bytes[22] & 0x3f) << 8)) + 1,
            height:
                ((bytes[22] >> 6) |
                    (bytes[23] << 2) |
                    ((bytes[24] & 0x0f) << 10)) +
                1,
            details: { flavor: "lossless" },
        };
    }
    if (chunk === "VP8X" && bytes.length >= 30) {
        const flags = bytes[20];
        return {
            format: "webp",
            width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
            height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
            details: {
                flavor: "extended",
                animated: (flags & 0x02) !== 0,
                hasAlpha: (flags & 0x10) !== 0,
            },
        };
    }
    return null;
}

function parseBmp(bytes) {
    if (bytes.length < 30 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
        return null;
    }
    // BITMAPCOREHEADER (OS/2) predates the signed-height layout; skip it.
    if (u32le(bytes, 14) < 40) return null;
    const rawHeight = s32le(bytes, 22);
    return {
        format: "bmp",
        width: s32le(bytes, 18),
        height: Math.abs(rawHeight),
        details: { bpp: u16le(bytes, 28), topDown: rawHeight < 0 },
    };
}

function parseImage(bytes) {
    return (
        parsePng(bytes) ??
        parseJpeg(bytes) ??
        parseGif(bytes) ??
        parseWebp(bytes) ??
        parseBmp(bytes) ??
        null
    );
}

async function inspectImage(input) {
    if (input.startsWith("data:")) {
        const bytes = decodeDataUri(input);
        const parsed = parseImage(bytes) ?? {
            format: null,
            width: null,
            height: null,
        };
        return {
            source: "data URI",
            bytes: bytes.byteLength,
            truncated: false,
            ...parsed,
        };
    }
    const url = requireHttpUrl(input).toString();
    const image = await fetchBytes(url);
    const parsed = (image.bytes.byteLength > 0
        ? parseImage(image.bytes)
        : null) ?? {
        format: null,
        width: null,
        height: null,
    };
    return {
        source: url,
        status: image.status,
        ...(image.error ? { error: image.error } : {}),
        bytes: image.bytes.byteLength,
        truncated: image.truncated,
        ...(image.contentType ? { contentType: image.contentType } : {}),
        ...(image.etag ? { etag: image.etag } : {}),
        ...(image.xCache ? { xCache: image.xCache } : {}),
        ...(image.lastModified ? { lastModified: image.lastModified } : {}),
        ...parsed,
    };
}

function buildServer() {
    const server = new McpServer(
        {
            name: "image-inspect-mcp",
            title: "Image Inspect MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "inspect_image",
        {
            description:
                "Inspect an image's bytes: format (PNG, JPEG, GIF, WebP, BMP), dimensions, bit depth and other header facts, byte size, plus the origin's cache headers (ETag, X-Cache, Last-Modified). Accepts http(s) URLs and base64 data URIs; only public hosts are reachable and bodies are capped at 10 MB.",
            inputSchema: z.object({
                url: z
                    .string()
                    .min(1)
                    .describe(
                        "Image URL such as https://example.com/cat.png, or a base64 data:image/...;base64,... URI.",
                    ),
            }),
        },
        async ({ url }) =>
            createMCPResponse([
                createTextContent(await inspectImage(url), true),
            ]),
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
                "WWW-Authenticate":
                    'Bearer realm="image-inspect-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "image-inspect-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
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

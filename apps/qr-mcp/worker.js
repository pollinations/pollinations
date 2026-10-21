import { deflateSync } from "node:zlib";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import jpeg from "jpeg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import qrcode from "qrcode-generator";
import { z } from "zod";
import { withMcpUsageHeaders } from "../../shared/mcp-usage.ts";
import { QR_TOOL_CALL_PRICE } from "../../shared/registry/mcp.ts";

const ADJUSTMENT_ID = "qr.tool_call.v1";

// Byte-mode capacity of a version-40 code at ECC L; the tightest real limit.
const MAX_DATA_BYTES = 2953;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 12_000_000;

// qrcode-generator encodes with Shift-JIS by default; every QR reader
// expects UTF-8, so switch the byte function once before building codes.
qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

const hexColor = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .describe("Six-digit hex color, for example #1a2b4c.");

function hexToRgb(hex) {
    return [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
    ];
}

// ─── PNG encoding (RGB, filter 0) ───────────────────────────────────────────

let crcTable;
function crc32(buffer) {
    if (!crcTable) {
        crcTable = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            crcTable[n] = c;
        }
    }
    let crc = -1;
    for (const byte of buffer) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
    }
    return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const tag = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
    return Buffer.concat([length, tag, data, crc]);
}

/** Encode an RGB image (3 bytes per pixel) as a minimal PNG. */
function encodePng(width, height, rgb) {
    const raw = Buffer.alloc((width * 3 + 1) * height);
    let offset = 0;
    for (let y = 0; y < height; y++) {
        raw[offset++] = 0; // filter type: none
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 3;
            raw[offset++] = rgb[i];
            raw[offset++] = rgb[i + 1];
            raw[offset++] = rgb[i + 2];
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type: truecolor RGB
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", deflateSync(raw)),
        pngChunk("IEND", Buffer.alloc(0)),
    ]);
}

// ─── QR generation ───────────────────────────────────────────────────────────

function generateQrPng({
    data,
    scale,
    margin,
    error_correction,
    dark_color,
    light_color,
}) {
    if (Buffer.byteLength(data, "utf8") > MAX_DATA_BYTES) {
        throw new ToolFailure(
            400,
            `data is too long: ${Buffer.byteLength(data, "utf8")} UTF-8 bytes, the QR limit is ${MAX_DATA_BYTES}.`,
        );
    }
    const qr = qrcode(0, error_correction);
    qr.addData(data);
    try {
        qr.make();
    } catch {
        // Capacity shrinks with error correction (v40 byte mode: L 2953,
        // M 2331, Q 1663, H 1273); overflow throws here.
        throw new ToolFailure(
            400,
            `data does not fit at error correction ${error_correction} (${Buffer.byteLength(data, "utf8")} UTF-8 bytes). Shorten it or use a lower error_correction.`,
        );
    }
    const modules = qr.getModuleCount();
    const size = (modules + margin * 2) * scale;
    const dark = hexToRgb(dark_color);
    const light = hexToRgb(light_color);
    const rgb = Buffer.alloc(size * size * 3);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const row = Math.floor(y / scale) - margin;
            const column = Math.floor(x / scale) - margin;
            const on =
                row >= 0 &&
                column >= 0 &&
                row < modules &&
                column < modules &&
                qr.isDark(row, column);
            const color = on ? dark : light;
            const i = (y * size + x) * 3;
            rgb[i] = color[0];
            rgb[i + 1] = color[1];
            rgb[i + 2] = color[2];
        }
    }
    return {
        png: encodePng(size, size, rgb),
        modules,
        size,
        version: (modules - 17) / 4,
    };
}

// ─── QR reading ──────────────────────────────────────────────────────────────

class ToolFailure extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function fetchImageBytes(image, fetchImpl) {
    if (image.startsWith("data:")) {
        const comma = image.indexOf(",");
        const meta = image.slice(5, comma === -1 ? undefined : comma);
        if (!meta.startsWith("image/")) {
            throw new ToolFailure(
                400,
                "Only image data URIs are supported (data:image/png or data:image/jpeg).",
            );
        }
        return bytesWithSize(Buffer.from(image.slice(comma + 1), "base64"));
    }
    let url;
    try {
        url = new URL(image);
    } catch {
        throw new ToolFailure(
            400,
            "image must be an HTTPS URL or a data: URI.",
        );
    }
    if (url.protocol !== "https:") {
        throw new ToolFailure(
            400,
            "image must be an HTTPS URL or a data: URI.",
        );
    }
    const response = await fetchImpl(url);
    if (!response.ok) {
        throw new ToolFailure(
            response.status >= 500 ? 502 : 400,
            `Fetching the image failed with HTTP ${response.status}.`,
        );
    }
    return bytesWithSize(Buffer.from(await response.arrayBuffer()));
}

function bytesWithSize(bytes) {
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
        throw new ToolFailure(400, "Image must be between 1 byte and 10 MiB.");
    }
    return bytes;
}

function decodeToRgba(bytes) {
    const pixels = (width, height) => {
        if (width * height > MAX_IMAGE_PIXELS) {
            throw new ToolFailure(
                400,
                `Image is too large (${width}x${height}); keep it under 12 million pixels.`,
            );
        }
    };
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) {
        const png = PNG.sync.read(bytes);
        pixels(png.width, png.height);
        return { data: png.data, width: png.width, height: png.height };
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        const decoded = jpeg.decode(bytes, { useTArray: true });
        pixels(decoded.width, decoded.height);
        return {
            data: decoded.data,
            width: decoded.width,
            height: decoded.height,
        };
    }
    throw new ToolFailure(400, "Image is neither a PNG nor a JPEG.");
}

function scanForQr({ data, width, height }) {
    const found = jsQR(data, width, height);
    if (found) {
        return found;
    }
    // Some codes are light-on-dark (dark-mode screenshots); scan once more
    // with inverted pixels before giving up.
    const inverted = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i++) {
        inverted[i] = 255 - data[i];
    }
    return jsQR(inverted, width, height);
}

// ─── Server ──────────────────────────────────────────────────────────────────

function buildServer({ fetchImpl, reportUsage }) {
    const server = new McpServer(
        { name: "qr-mcp", title: "QR Codes MCP", version: "0.1.0" },
        {
            instructions:
                "Deterministic QR codes: generate scannable codes as PNG images and read the text behind QR codes in PNG or JPEG images. Image models draw QR-shaped noise that does not scan; use these tools instead.",
            capabilities: { tools: {} },
        },
    );

    async function runTool(tool, run) {
        try {
            const result = await run();
            reportUsage({
                cost: QR_TOOL_CALL_PRICE,
                tool,
                status: 200,
                adjustmentId: ADJUSTMENT_ID,
                adjustmentUnits: 1,
            });
            return result;
        } catch (error) {
            const failure =
                error instanceof ToolFailure
                    ? error
                    : new ToolFailure(500, "QR tool call failed");
            reportUsage({
                cost: 0,
                tool,
                status: failure.status,
                adjustmentId: ADJUSTMENT_ID,
                adjustmentUnits: 0,
                error: failure.message,
            });
            throw failure;
        }
    }

    server.registerTool(
        "generate_qr",
        {
            description:
                "Encode text, a URL, wifi credentials, a payment address, or any short string as a scannable QR code, returned as a PNG image plus its dimensions. Image models draw QR-shaped noise that does not scan; this tool produces a real, deterministic code. Pick high error correction for codes that must survive printing or damage.",
            inputSchema: z.object({
                data: z
                    .string()
                    .min(1)
                    .max(5000)
                    .describe(
                        "The text or URL to encode (UTF-8, up to 2953 bytes once encoded).",
                    ),
                scale: z
                    .number()
                    .int()
                    .min(1)
                    .max(32)
                    .optional()
                    .describe(
                        "Pixels per module (default 8). Bigger scans better from screens.",
                    ),
                margin: z
                    .number()
                    .int()
                    .min(0)
                    .max(16)
                    .optional()
                    .describe(
                        "Quiet-zone modules on every side (default 4). Keep at least 2 for reliable scanning.",
                    ),
                error_correction: z
                    .enum(["L", "M", "Q", "H"])
                    .optional()
                    .describe(
                        "Error correction level (default M). H survives up to 30% damage but holds less data.",
                    ),
                dark_color: hexColor
                    .optional()
                    .describe("Color of the modules (default #000000)."),
                light_color: hexColor
                    .optional()
                    .describe("Color of the background (default #ffffff)."),
            }),
        },
        async (params) =>
            runTool("generate_qr", async () => {
                const { png, modules, size, version } = generateQrPng({
                    data: params.data,
                    scale: params.scale ?? 8,
                    margin: params.margin ?? 4,
                    error_correction: params.error_correction ?? "M",
                    dark_color: params.dark_color ?? "#000000",
                    light_color: params.light_color ?? "#ffffff",
                });
                return {
                    content: [
                        {
                            type: "image",
                            data: png.toString("base64"),
                            mimeType: "image/png",
                        },
                        {
                            type: "text",
                            text: JSON.stringify({
                                mimeType: "image/png",
                                width: size,
                                height: size,
                                bytes: png.length,
                                qrVersion: version,
                                modules,
                                errorCorrection: params.error_correction ?? "M",
                            }),
                        },
                    ],
                };
            }),
    );

    server.registerTool(
        "read_qr",
        {
            description:
                "Read the text encoded in a QR code from an image (PNG or JPEG, public HTTPS URL or data: URI, up to 10 MiB). Returns the decoded text, not a guess: use it to open links, join wifi, or verify that a generated code is scannable. Light-on-dark codes are scanned too.",
            inputSchema: z.object({
                image: z
                    .string()
                    .min(1)
                    .describe(
                        "Public HTTPS URL or data:image/...;base64 URI of the image to read.",
                    ),
            }),
        },
        async (params) =>
            runTool("read_qr", async () => {
                const bytes = await fetchImageBytes(
                    params.image,
                    fetchImpl ?? globalThis.fetch.bind(globalThis),
                );
                const found = scanForQr(decodeToRgba(bytes));
                if (!found) {
                    throw new ToolFailure(
                        404,
                        "No QR code found in the image. Make sure the whole code is visible, reasonably sharp, and has a quiet zone around it.",
                    );
                }
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    data: found.data,
                                    qrVersion: found.version?.version,
                                    bytes: found.binaryData?.length,
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            }),
    );

    return server;
}

export function createWorker({ fetchImpl } = {}) {
    return {
        async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === "/health" && request.method === "GET") {
                return Response.json({
                    name: "qr-mcp",
                    transport: "streamable-http",
                    endpoint: "/",
                    stateless: true,
                });
            }
            if (url.pathname !== "/") {
                return new Response("Not found", { status: 404 });
            }
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

            let usage;
            const handler = createMcpHandler(
                () =>
                    buildServer({
                        fetchImpl,
                        reportUsage: (reported) => {
                            usage = reported;
                        },
                    }),
                {
                    legacy: "stateless",
                    // A 10 MiB image as a data URI is ~13.7 MiB of base64;
                    // lift the SDK's 4 MiB body cap to match the tool's limit.
                    maxRequestBodySize: 16 * 1024 * 1024,
                    onerror: (error) => console.error(error),
                },
            );
            const response = await handler.fetch(request);
            const body = await response.arrayBuffer();
            return withMcpUsageHeaders(new Response(body, response), usage);
        },
    };
}

export { decodeToRgba, fetchImageBytes, generateQrPng, ToolFailure };

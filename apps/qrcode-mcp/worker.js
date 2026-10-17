import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import QRCode from "qrcode";

// QR byte-mode capacity per error correction level.
const MAX_BYTES = { low: 2953, medium: 2331, quartile: 1663, high: 1273 };

const createQrSchema = z.object({
    text: z
        .string()
        .describe(
            "The content to encode: a URL, plain text, or a structured payload " +
                "such as WIFI:T:WPA;S:name;P:password;; or MECARD:N:Name;TEL:1234;;",
        ),
    error_correction: z
        .enum(["low", "medium", "quartile", "high"])
        .default("medium")
        .describe(
            "low: largest capacity, least robust. high: survives logos, " +
                "damage, and low-quality scans. medium is a good default.",
        ),
    size: z
        .number()
        .int()
        .min(128)
        .max(2048)
        .default(512)
        .describe("PNG edge length in pixels (SVG scales to any size)."),
    format: z
        .enum(["svg", "png", "both"])
        .default("both")
        .describe("svg: text content you can save as .svg. png: data URI."),
});

function qrError(message) {
    return {
        isError: true,
        content: [{ type: "text", text: `QR creation failed: ${message}` }],
    };
}

async function renderQr({ text, error_correction, size, format }) {
    const options = {
        errorCorrectionLevel: error_correction,
        margin: 2,
    };
    if (format === "svg") {
        const svg = await QRCode.toString(text, {
            ...options,
            type: "svg",
        });
        return [{ type: "text", text: svg }];
    }
    if (format === "png") {
        const dataUri = await QRCode.toDataURL(text, {
            ...options,
            width: size,
        });
        return [{ type: "text", text: dataUri }];
    }
    const [svg, dataUri] = await Promise.all([
        QRCode.toString(text, { ...options, type: "svg" }),
        QRCode.toDataURL(text, { ...options, width: size }),
    ]);
    return [
        { type: "text", text: svg },
        { type: "text", text: dataUri },
    ];
}

function buildServer() {
    const server = new McpServer(
        { name: "qrcode-mcp", title: "QR Code MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "create_qr",
        {
            description:
                "Create a QR code for a URL or short text and get it back as " +
                "SVG markup and/or a PNG data URI. Works offline; no other " +
                "service is called. Keep text within the byte capacity of " +
                "the chosen error correction level.",
            inputSchema: createQrSchema,
        },
        async (args) => {
            const bytes = new TextEncoder().encode(args.text).length;
            if (bytes === 0) {
                return qrError("text is empty.");
            }
            if (bytes > MAX_BYTES[args.error_correction]) {
                return qrError(
                    `text is ${bytes} bytes; ${args.error_correction} error ` +
                        `correction holds at most ${MAX_BYTES[args.error_correction]}. ` +
                        "Shorten the text or lower the error correction level.",
                );
            }
            try {
                const content = await renderQr(args);
                return { content };
            } catch (error) {
                if (
                    String(error?.message || error).includes("code length")
                ) {
                    return qrError(
                        "text does not fit in a QR code at this error " +
                            "correction level; shorten it or lower the level.",
                    );
                }
                throw error;
            }
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
                "WWW-Authenticate": 'Bearer realm="qrcode-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "qrcode-mcp",
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

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const hexColor = z
    .string()
    .regex(/^#(?:[\da-f]{3}|[\da-f]{6})$/i)
    .describe("sRGB hex color in #RGB or #RRGGBB form");

function parseHex(hex) {
    const value = hex.slice(1);
    const expanded =
        value.length === 3
            ? [...value].map((digit) => digit.repeat(2)).join("")
            : value;
    return {
        hex: `#${expanded.toLowerCase()}`,
        channels: [0, 2, 4].map((index) =>
            Number.parseInt(expanded.slice(index, index + 2), 16),
        ),
    };
}

function luminance(channels) {
    const [red, green, blue] = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground, background) {
    const first = luminance(foreground.channels);
    const second = luminance(background.channels);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function resultFor(foregroundHex, backgroundHex) {
    const foreground = parseHex(foregroundHex);
    const background = parseHex(backgroundHex);
    const ratio = contrast(foreground, background);
    return {
        foreground: foreground.hex,
        background: background.hex,
        ratio: Math.round(ratio * 100) / 100,
        wcag_2_2: {
            normal_text: { aa: ratio >= 4.5, aaa: ratio >= 7 },
            large_text: { aa: ratio >= 3, aaa: ratio >= 4.5 },
            non_text: { aa: ratio >= 3 },
        },
    };
}

function jsonResponse(value) {
    return createMCPResponse([
        createTextContent(JSON.stringify(value, null, 2)),
    ]);
}

function buildServer() {
    const server = new McpServer(
        { name: "contrast-mcp", title: "Contrast MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "check_contrast",
        {
            description:
                "Check two sRGB hex colors against WCAG 2.2 contrast thresholds for normal text, large text, and non-text UI components.",
            inputSchema: {
                foreground: hexColor.describe("Text or foreground color"),
                background: hexColor.describe("Background color"),
            },
        },
        ({ foreground, background }) =>
            jsonResponse(resultFor(foreground, background)),
    );
    server.registerTool(
        "rank_palette",
        {
            description:
                "Rank candidate sRGB hex colors by contrast against one background and report which meet a requested ratio.",
            inputSchema: {
                background: hexColor,
                colors: z
                    .array(hexColor)
                    .min(1)
                    .max(20)
                    .describe("Candidate foreground colors, up to 20"),
                minimum_ratio: z
                    .number()
                    .min(1)
                    .max(21)
                    .optional()
                    .describe("Required ratio from 1 to 21 (default 4.5)"),
            },
        },
        ({ background, colors, minimum_ratio = 4.5 }) => {
            const backgroundColor = parseHex(background);
            const ranked = colors
                .map((color) => {
                    const foreground = parseHex(color);
                    const ratio = contrast(foreground, backgroundColor);
                    return {
                        color: foreground.hex,
                        rawRatio: ratio,
                        ratio: Math.round(ratio * 100) / 100,
                    };
                })
                .sort((first, second) => second.rawRatio - first.rawRatio)
                .map(({ color, rawRatio, ratio }) => ({
                    color,
                    ratio,
                    passes: rawRatio >= minimum_ratio,
                }));
            return jsonResponse({
                background: backgroundColor.hex,
                minimum_ratio,
                colors: ranked,
            });
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
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;
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
                    'Bearer realm="contrast-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "contrast-mcp",
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

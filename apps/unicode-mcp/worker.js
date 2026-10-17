import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const CONFUSABLES = {
    "Β": "B",
    "Ε": "E",
    "Ζ": "Z",
    "Η": "H",
    "Ι": "I",
    "Κ": "K",
    "Μ": "M",
    "Ν": "N",
    "Ο": "O",
    "Ρ": "P",
    "Τ": "T",
    "Υ": "Y",
    "Χ": "X",
    "а": "a",
    "е": "e",
    "о": "o",
    "р": "p",
    "с": "c",
    "х": "x",
    "і": "i",
    "ј": "j",
    "Α": "A",
    "ο": "o",
    "ν": "v",
    "м": "m",
};

export function inspect(text) {
    if (
        typeof text !== "string" ||
        [...text].length < 1 ||
        [...text].length > 4000
    ) {
        throw new Error("Text must contain 1-4000 Unicode code points");
    }
    const codePoints = [...text];
    const suspicious = [];
    let skeleton = "";
    for (const character of codePoints) {
        const codePoint = character.codePointAt(0);
        const replacement = CONFUSABLES[character];
        if (replacement) {
            suspicious.push({
                character,
                codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
                name: "common Latin lookalike",
                suggestion: replacement,
            });
            skeleton += replacement;
        } else if (/\p{Cc}|\p{Cf}/u.test(character)) {
            suspicious.push({
                character:
                    codePoint <= 0xffff
                        ? character
                        : `U+${codePoint.toString(16).toUpperCase()}`,
                codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
                name: "control or invisible format character",
                suggestion: "remove",
            });
        } else {
            skeleton += character;
        }
    }
    return {
        text,
        codePointCount: codePoints.length,
        suspicious,
        confusableSkeleton: skeleton,
        isAscii: [...text].every(
            (character) => character.codePointAt(0) <= 0x7f,
        ),
    };
}

function buildServer() {
    const server = new McpServer(
        {
            name: "unicode-mcp",
            title: "Unicode Inspector MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "inspect_unicode",
        {
            description:
                "Inspect text for common Unicode lookalikes and invisible control/format characters. Returns code-point count, suspicious characters with code points, an ASCII flag, and a simple confusable skeleton. This is a heuristic, not a complete UTS #39 confusable detector.",
            inputSchema: {
                text: z
                    .string()
                    .min(1)
                    .max(4000)
                    .describe("Text to inspect (1-4000 Unicode code points)."),
            },
        },
        async ({ text }) =>
            createMCPResponse([createTextContent(inspect(text), true)]),
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
                    'Bearer realm="unicode-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "unicode-mcp",
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

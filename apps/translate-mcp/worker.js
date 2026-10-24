import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const MYMEMORY = "https://api.mymemory.translated.net/get";

const LANGUAGES = {
    en: "English",
    id: "Indonesian",
    ms: "Malay",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    ar: "Arabic",
    de: "German",
    fr: "French",
    es: "Spanish",
    pt: "Portuguese",
    it: "Italian",
    ru: "Russian",
    nl: "Dutch",
    sv: "Swedish",
    no: "Norwegian",
    da: "Danish",
    fi: "Finnish",
    pl: "Polish",
    tr: "Turkish",
    vi: "Vietnamese",
    th: "Thai",
    hi: "Hindi",
    bn: "Bengali",
    ur: "Urdu",
    fa: "Persian",
    he: "Hebrew",
    el: "Greek",
    cs: "Czech",
    hu: "Hungarian",
    ro: "Romanian",
    uk: "Ukrainian",
    bg: "Bulgarian",
    sr: "Serbian",
    hr: "Croatian",
    sk: "Slovak",
    sl: "Slovenian",
    lt: "Lithuanian",
    lv: "Latvian",
    et: "Estonian",
    ca: "Catalan",
    ta: "Tamil",
    te: "Telugu",
    mr: "Marathi",
    gu: "Gujarati",
    kn: "Kannada",
    ml: "Malayalam",
    pa: "Punjabi",
    sw: "Swahili",
    tl: "Tagalog",
};

function normalizeCode(code) {
    const c = String(code || "")
        .toLowerCase()
        .trim();
    if (LANGUAGES[c]) return c;
    for (const [k, name] of Object.entries(LANGUAGES)) {
        if (name.toLowerCase() === c) return k;
        if (c.startsWith(k + "-")) return k;
    }
    return null;
}

async function myMemoryTranslate(q, langpair) {
    const url = `${MYMEMORY}?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(langpair)}`;
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`MyMemory returned HTTP ${response.status}`);
    const data = await response.json();
    if (data.responseStatus !== 200 || !data.responseData) {
        throw new Error(
            `MyMemory error: ${data.responseDetails ?? data.responseStatus}`,
        );
    }
    return {
        translatedText: data.responseData.translatedText ?? "",
        detectedLanguage: data.responseData.detectedLanguage ?? null,
        match: data.responseData.match ?? null,
        quotaExhausted: data?.quotaFinished ?? false,
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "translate-mcp", title: "Translate MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "translate",
        {
            description:
                "Translate text between languages using MyMemory (free, no API key). " +
                "Source auto-detects when omitted. Target can be a code (en, id, ja) or language name (English, Indonesian).",
            inputSchema: {
                text: z.string().describe("Text to translate"),
                target: z
                    .string()
                    .describe(
                        "Target language code or name, e.g. id, en, ja, Spanish",
                    ),
                source: z
                    .string()
                    .optional()
                    .describe(
                        "Source language code or name (default auto-detect)",
                    ),
            },
        },
        async ({ text, target, source }) => {
            const targetCode = normalizeCode(target);
            if (!targetCode) {
                return createMCPResponse([
                    createTextContent(`Unknown target language: ${target}`),
                ]);
            }
            let langpair;
            if (source) {
                const sourceCode = normalizeCode(source);
                if (!sourceCode) {
                    return createMCPResponse([
                        createTextContent(`Unknown source language: ${source}`),
                    ]);
                }
                langpair = `${sourceCode}|${targetCode}`;
            } else {
                langpair = `Autodetect|${targetCode}`;
            }
            const result = await myMemoryTranslate(text, langpair);
            return createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        {
                            text,
                            target: targetCode,
                            source: result.detectedLanguage ?? source ?? "auto",
                            translatedText: result.translatedText,
                            matchScore: result.match,
                            quotaExhausted: result.quotaExhausted,
                        },
                        null,
                        2,
                    ),
                ),
            ]);
        },
    );

    server.registerTool(
        "list_languages",
        {
            description:
                "List all supported language codes and names for the translate tool.",
            inputSchema: {},
        },
        async () => {
            return createMCPResponse([
                createTextContent(JSON.stringify(LANGUAGES, null, 2)),
            ]);
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
                    'Bearer realm="translate-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "translate-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }
        if (url.pathname !== "/")
            return new Response("Not found", { status: 404 });
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
            authInfo: { token, clientId: "pollinations-api-key", scopes: [] },
        });
    },
};

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const QURAN_API = "https://api.alquran.cloud/v1";
const DEFAULT_EDITION = "en.sahih";

async function quranFetch(path) {
    const response = await fetch(`${QURAN_API}${path}`);
    if (!response.ok) {
        throw new Error(`alquran.cloud returned HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.code !== 200 || !data.data) {
        throw new Error(`alquran.cloud error: ${data.status ?? data.code}`);
    }
    return data.data;
}

function formatAyah(ayah) {
    return {
        surahNumber: ayah.surah?.number ?? null,
        surahName: ayah.surah?.englishName ?? null,
        ayahNumber: ayah.numberInSurah ?? null,
        text: ayah.text ?? null,
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "quran-mcp", title: "Quran MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "get_surah",
        {
            description:
                "Get a Qur'an surah (chapter) with its verses. " +
                "Returns surah metadata and each verse's text. By default uses the English Sahih International translation; " +
                "pass edition like quran-uthmani-quran-academy for Arabic text.",
            inputSchema: {
                surahNumber: z
                    .number()
                    .int()
                    .min(1)
                    .max(114)
                    .describe("Surah number 1-114"),
                edition: z
                    .string()
                    .optional()
                    .describe("Edition identifier (default en.sahih)"),
            },
        },
        async ({ surahNumber, edition = DEFAULT_EDITION }) => {
            const data = await quranFetch(`/surah/${surahNumber}/${edition}`);
            const result = {
                surahNumber: data.number,
                englishName: data.englishName,
                arabicName: data.name,
                revelationType: data.revelationType,
                totalAyahs: data.numberOfAyahs,
                ayahs: data.ayahs.map((a) => ({
                    ayahNumber: a.numberInSurah,
                    text: a.text,
                })),
            };
            return createMCPResponse([
                createTextContent(JSON.stringify(result, null, 2)),
            ]);
        },
    );

    server.registerTool(
        "get_ayah",
        {
            description:
                "Get a single Qur'an verse by reference like surah:ayah (e.g. 2:255 = Ayat Kursi). " +
                "Returns surah name, ayah number, and text.",
            inputSchema: {
                reference: z
                    .string()
                    .describe("Verse reference, e.g. 2:255 or 1:1"),
                edition: z
                    .string()
                    .optional()
                    .describe("Edition identifier (default en.sahih)"),
            },
        },
        async ({ reference, edition = DEFAULT_EDITION }) => {
            const data = await quranFetch(
                `/ayah/${encodeURIComponent(reference)}/${edition}`,
            );
            return createMCPResponse([
                createTextContent(JSON.stringify(formatAyah(data), null, 2)),
            ]);
        },
    );

    server.registerTool(
        "search_quran",
        {
            description:
                "Search the Qur'an translation for a keyword. " +
                "Returns up to 5 matching verses with surah and ayah references.",
            inputSchema: {
                keyword: z
                    .string()
                    .describe("Search keyword, e.g. mercy, patience, justice"),
            },
        },
        async ({ keyword }) => {
            const data = await quranFetch(
                `/search/${encodeURIComponent(keyword)}`,
            );
            const matches = (data.matches ?? []).slice(0, 5).map((m) => ({
                surahNumber: m.surah?.number ?? null,
                surahName: m.surah?.englishName ?? null,
                ayahNumber: m.numberInSurah ?? null,
                text: m.text ?? null,
            }));
            const result = {
                keyword,
                totalMatches: data.count ?? matches.length,
                matches,
            };
            return createMCPResponse([
                createTextContent(JSON.stringify(result, null, 2)),
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
                "WWW-Authenticate": 'Bearer realm="quran-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "quran-mcp",
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

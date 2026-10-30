import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const NAGER_DATE_URL = "https://date.nager.at/api/v3/PublicHolidays";

// Nager.Date needs no key, so the caller's Pollinations key is never forwarded.
async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body)) {
        const reason =
            body?.detail ||
            body?.title ||
            `Nager.Date request failed with status ${response.status}`;
        throw new Error(reason);
    }
    return body;
}

function toHoliday(entry) {
    return {
        date: entry.date,
        name: entry.name,
        local_name: entry.localName,
        country_code: entry.countryCode,
        global: entry.global,
        fixed: entry.fixed,
        types: entry.types,
    };
}

function byDate(a, b) {
    return a.date.localeCompare(b.date);
}

function buildServer() {
    const server = new McpServer(
        { name: "holidays-mcp", title: "Holidays MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "holidays_for_year",
        {
            description:
                "List every public holiday for one country in one year, with " +
                "dates, local and English names, global/regional scope, " +
                "fixed status, and holiday types.",
            inputSchema: {
                country_code: z
                    .string()
                    .min(2)
                    .max(2)
                    .describe(
                        "ISO-3166 alpha-2 country code, uppercase, e.g. 'DE' or 'US'",
                    ),
                year: z
                    .number()
                    .int()
                    .min(1970)
                    .max(2100)
                    .describe("Calendar year"),
            },
        },
        async ({ country_code, year }) => {
            const entries = await fetchJson(
                `${NAGER_DATE_URL}/${year}/${country_code}`,
            );
            if (entries.length === 0) {
                throw new Error(
                    `No holidays found for ${country_code} in ${year}`,
                );
            }
            const holidays = entries.map(toHoliday).sort(byDate);
            return createMCPResponse([
                createTextContent(
                    { country_code, year, count: holidays.length, holidays },
                    true,
                ),
            ]);
        },
    );
    server.registerTool(
        "holidays_for_country",
        {
            description:
                "List public holidays for a country without picking a year: " +
                "the current and next year merged, deduped, and sorted, so " +
                "agents can answer 'when is the next holiday?'. Pass a year " +
                "to look up just that year.",
            inputSchema: {
                country_code: z
                    .string()
                    .min(2)
                    .max(2)
                    .describe(
                        "ISO-3166 alpha-2 country code, uppercase, e.g. 'GB' or 'IN'",
                    ),
                year: z
                    .number()
                    .int()
                    .min(1970)
                    .max(2100)
                    .optional()
                    .describe(
                        "Optional calendar year; defaults to the current and next year",
                    ),
            },
        },
        async ({ country_code, year }) => {
            const currentYear = new Date().getUTCFullYear();
            const years =
                year == null ? [currentYear, currentYear + 1] : [year];
            const perYear = await Promise.all(
                years.map((y) =>
                    fetchJson(`${NAGER_DATE_URL}/${y}/${country_code}`),
                ),
            );
            const seen = new Set();
            const holidays = perYear
                .flat()
                .filter((entry) => {
                    if (seen.has(entry.date)) return false;
                    seen.add(entry.date);
                    return true;
                })
                .map(toHoliday)
                .sort(byDate);
            if (holidays.length === 0) {
                throw new Error(
                    `No holidays found for ${country_code} in ${years.join(" or ")}`,
                );
            }
            return createMCPResponse([
                createTextContent(
                    { country_code, years, count: holidays.length, holidays },
                    true,
                ),
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
                "WWW-Authenticate":
                    'Bearer realm="holidays-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "holidays-mcp",
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

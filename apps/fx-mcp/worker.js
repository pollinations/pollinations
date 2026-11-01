import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const FX_API_BASE = "https://api.frankfurter.dev/v1";
const CURRENCY_CODE = /^[A-Z]{3}$/;

// Frankfurter needs no key, so the caller's Pollinations key is never forwarded.
async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body === null) {
        throw new Error(
            `Exchange rate request failed with status ${response.status}`,
        );
    }
    return body;
}

function ratesUrl(date, base, symbols) {
    const url = new URL(`${FX_API_BASE}/${date ?? "latest"}`);
    if (base) url.searchParams.set("base", base);
    if (symbols?.length) url.searchParams.set("symbols", symbols.join(","));
    return url;
}

function buildServer() {
    const server = new McpServer(
        { name: "fx-mcp", title: "Exchange Rates MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "fx_currencies",
        {
            description:
                "List the currency codes available for exchange rates, " +
                "with their full names. Reference rates from the European Central Bank.",
            inputSchema: {},
        },
        async () => {
            const body = await fetchJson(`${FX_API_BASE}/currencies`);
            return createMCPResponse([
                createTextContent(JSON.stringify(body, null, 2)),
            ]);
        },
    );
    server.registerTool(
        "fx_rates",
        {
            description:
                "Get exchange rates for a base currency, latest by default or " +
                "for a historical date back to 1999. Rates are ECB reference " +
                "rates, published once a day around 16:00 CET.",
            inputSchema: {
                base: z
                    .string()
                    .regex(CURRENCY_CODE)
                    .optional()
                    .describe(
                        "Base currency code, e.g. 'EUR' (default) or 'USD'",
                    ),
                symbols: z
                    .array(z.string().regex(CURRENCY_CODE))
                    .optional()
                    .describe("Quote currencies to include; all when omitted"),
                date: z
                    .string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/)
                    .optional()
                    .describe(
                        "Historical date as YYYY-MM-DD; latest when omitted",
                    ),
            },
        },
        async ({ base, symbols, date }) => {
            const body = await fetchJson(ratesUrl(date, base, symbols));
            return createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        { base: body.base, date: body.date, rates: body.rates },
                        null,
                        2,
                    ),
                ),
            ]);
        },
    );
    server.registerTool(
        "fx_convert",
        {
            description:
                "Convert an amount between two currencies using the latest " +
                "(or a historical) ECB reference rate.",
            inputSchema: {
                amount: z.number().positive().describe("Amount to convert"),
                from: z
                    .string()
                    .regex(CURRENCY_CODE)
                    .describe("Source currency code, e.g. 'USD'"),
                to: z
                    .string()
                    .regex(CURRENCY_CODE)
                    .describe("Target currency code, e.g. 'INR'"),
                date: z
                    .string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/)
                    .optional()
                    .describe(
                        "Historical rate date as YYYY-MM-DD; latest when omitted",
                    ),
            },
        },
        async ({ amount, from, to, date }) => {
            const body = await fetchJson(ratesUrl(date, from, [to]));
            const rate = body.rates?.[to];
            if (rate === undefined) {
                throw new Error(
                    `No ${from}->${to} rate available for ${body.date}`,
                );
            }
            return createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        {
                            amount,
                            from,
                            to,
                            rate,
                            converted:
                                Math.round(amount * rate * 10000) / 10000,
                            date: body.date,
                        },
                        null,
                        2,
                    ),
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
                "WWW-Authenticate": 'Bearer realm="fx-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "fx-mcp",
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

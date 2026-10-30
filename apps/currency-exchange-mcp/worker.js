import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createMcpHandler } from "@modelcontextprotocol/server";

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

function buildServer() {
    const server = new McpServer(
        { name: "currency-exchange-mcp", title: "Currency Exchange MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "convert_currency",
        {
            description:
                "Convert an amount from one currency to another using the latest ECB exchange rates. " +
                "Provide the amount, from currency (ISO 4217 code like USD, EUR, GBP), and to currency. " +
                "Returns the converted amount, rate, and timestamp.",
            inputSchema: {
                amount: z.number().positive().describe("Amount to convert"),
                from: z.string().length(3).describe("Source currency code (ISO 4217, e.g., USD)"),
                to: z.string().length(3).describe("Target currency code (ISO 4217, e.g., EUR)"),
            },
        },
        async ({ amount, from, to }) => {
            const url = `${FRANKFURTER_BASE}/latest?from=${from.toUpperCase()}&to=${to.toUpperCase()}`;
            const response = await fetch(url);
            if (!response.ok) {
                const errorText = await response.text().catch(() => response.statusText);
                throw new Error(`Frankfurter API error: ${errorText}`);
            }
            const data = await response.json();
            const rate = data.rates?.[to.toUpperCase()];
            if (rate === undefined) {
                throw new Error(`Currency ${to.toUpperCase()} not found in rates`);
            }
            const converted = amount * rate;
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            amount,
                            from: from.toUpperCase(),
                            to: to.toUpperCase(),
                            rate,
                            converted: Number(converted.toFixed(6)),
                            date: data.date,
                        }, null, 2),
                    },
                ],
            };
        },
    );

    server.registerTool(
        "latest_rates",
        {
            description:
                "Get the latest ECB exchange rates for a base currency. " +
                "Optionally filter to specific target currencies. " +
                "Returns all rates with the base currency and date.",
            inputSchema: {
                base: z.string().length(3).default("EUR").describe("Base currency code (ISO 4217, default: EUR)"),
                symbols: z.string().optional().describe("Comma-separated target currency codes to filter (e.g., USD,GBP,JPY)"),
            },
        },
        async ({ base = "EUR", symbols }) => {
            let url = `${FRANKFURTER_BASE}/latest?from=${base.toUpperCase()}`;
            if (symbols) {
                url += `&to=${symbols.toUpperCase()}`;
            }
            const response = await fetch(url);
            if (!response.ok) {
                const errorText = await response.text().catch(() => response.statusText);
                throw new Error(`Frankfurter API error: ${errorText}`);
            }
            const data = await response.json();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            base: data.base,
                            date: data.date,
                            rates: data.rates,
                        }, null, 2),
                    },
                ],
            };
        },
    );

    server.registerTool(
        "historical_rates",
        {
            description:
                "Get historical ECB exchange rates for a specific date (YYYY-MM-DD) or date range. " +
                "Optionally filter to specific target currencies. " +
                "Returns rates for each date in the range.",
            inputSchema: {
                base: z.string().length(3).default("EUR").describe("Base currency code (ISO 4217, default: EUR)"),
                date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Single date (YYYY-MM-DD) or start date"),
                endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date for range (YYYY-MM-DD)"),
                symbols: z.string().optional().describe("Comma-separated target currency codes to filter (e.g., USD,GBP,JPY)"),
            },
        },
        async ({ base = "EUR", date, endDate, symbols }) => {
            let url;
            if (endDate) {
                url = `${FRANKFURTER_BASE}/${date}..${endDate}?from=${base.toUpperCase()}`;
            } else {
                url = `${FRANKFURTER_BASE}/${date}?from=${base.toUpperCase()}`;
            }
            if (symbols) {
                url += `&to=${symbols.toUpperCase()}`;
            }
            const response = await fetch(url);
            if (!response.ok) {
                const errorText = await response.text().catch(() => response.statusText);
                throw new Error(`Frankfurter API error: ${errorText}`);
            }
            const data = await response.json();
            const result = {
                base: data.base,
                rates: data.rates,
            };
            if (endDate) {
                result.start_date = data.start_date;
                result.end_date = data.end_date;
            } else {
                result.date = data.date;
            }
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        },
    );

    server.registerTool(
        "list_currencies",
        {
            description:
                "List all available currency codes supported by the Frankfurter API (ECB). " +
                "Returns a map of currency code to currency name.",
            inputSchema: {},
        },
        async () => {
            const response = await fetch(`${FRANKFURTER_BASE}/currencies`);
            if (!response.ok) {
                const errorText = await response.text().catch(() => response.statusText);
                throw new Error(`Frankfurter API error: ${errorText}`);
            }
            const data = await response.json();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(data, null, 2),
                    },
                ],
            };
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
                "WWW-Authenticate": 'Bearer realm="currency-exchange-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "currency-exchange-mcp",
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
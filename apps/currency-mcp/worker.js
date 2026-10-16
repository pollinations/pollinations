import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

const USER_AGENT = "currency-mcp/0.1 (https://pollinations.ai)";
const MAX_RANGE_DAYS = 366;
const NO_RATES =
    "No ECB rates for that request: unknown currency code, or a date before 1999-01-04 or in the future.";

const code = z
    .string()
    .regex(/^[A-Z]{3}$/)
    .describe("ISO 4217 currency code, uppercase, e.g. USD");

const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
        (value) =>
            new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
        "not a calendar date",
    )
    .describe("Date as YYYY-MM-DD");

// Frankfurter answers 404 for an unknown currency or a date outside the ECB
// history and 422 for a rejected pair; both are bad input, so return null.
async function frankfurter(path, params = {}) {
    const query = new URLSearchParams(params);
    const response = await fetch(
        `https://api.frankfurter.dev/v1/${path}${query.size ? `?${query}` : ""}`,
        { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
    );
    if (response.status === 404 || response.status === 422) return null;
    if (!response.ok) {
        throw new Error(`Frankfurter answered ${response.status}`);
    }
    return response.json();
}

const asText = (value) => ({
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const failure = (message) => ({
    isError: true,
    content: [{ type: "text", text: message }],
});

const daysBetween = (start, end) =>
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
    86_400_000;

function buildServer() {
    const server = new McpServer(
        { name: "currency-mcp", title: "Currency MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "currency_convert",
        {
            description:
                "Convert an amount between two currencies at the ECB reference rate. ECB publishes on working days, so a weekend or holiday date resolves to the previous working day; the date actually used is returned as `date`.",
            inputSchema: z.object({
                amount: z.number().positive().max(1e12),
                from: code,
                to: code,
                date: day.optional(),
            }),
        },
        async ({ amount, from, to, date }) => {
            if (from === to) return failure("from and to must differ.");
            const found = await frankfurter(date ?? "latest", {
                base: from,
                symbols: to,
            });
            if (!found) return failure(NO_RATES);
            const rate = found.rates[to];
            return asText({
                amount,
                from,
                to,
                rate,
                converted: Math.round(amount * rate * 1e6) / 1e6,
                date: found.date,
                ...(date && { requested_date: date }),
            });
        },
    );

    server.registerTool(
        "currency_rates",
        {
            description: `ECB reference rates for a base currency (default EUR): latest, on one date, or a daily time series with start and end (at most ${MAX_RANGE_DAYS} days apart; symbols required). Non-working days resolve to the previous working day, so returned dates can be earlier than requested.`,
            inputSchema: z.object({
                base: code.default("EUR"),
                symbols: z.array(code).min(1).max(30).optional(),
                date: day.optional(),
                start: day.optional(),
                end: day.optional(),
            }),
        },
        async ({ base, symbols, date, start, end }) => {
            const range = start !== undefined || end !== undefined;
            if (range && (!start || !end || date)) {
                return failure("Use either date, or both start and end.");
            }
            if (range) {
                const span = daysBetween(start, end);
                if (span < 0 || span > MAX_RANGE_DAYS) {
                    return failure(
                        `start must not be after end, and the range is capped at ${MAX_RANGE_DAYS} days.`,
                    );
                }
                if (!symbols) {
                    return failure("symbols are required for a time series.");
                }
            }
            const found = await frankfurter(
                range ? `${start}..${end}` : (date ?? "latest"),
                { base, ...(symbols && { symbols: symbols.join(",") }) },
            );
            if (!found) return failure(NO_RATES);
            return asText(
                range
                    ? {
                          base: found.base,
                          start_date: found.start_date,
                          end_date: found.end_date,
                          rates: found.rates,
                      }
                    : {
                          base: found.base,
                          date: found.date,
                          rates: found.rates,
                      },
            );
        },
    );

    server.registerTool(
        "currency_list",
        {
            description:
                "List the currencies the ECB publishes rates for, as currency code to name.",
            inputSchema: z.object({}),
        },
        async () => asText(await frankfurter("currencies")),
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const [scheme, token] = (request.headers.get("authorization") ?? "")
        .trim()
        .split(/\s+/, 2);
    return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "currency-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) {
            return Response.json(
                {
                    error: "unauthorized",
                    message: "Send a Pollinations API key as a bearer token.",
                },
                {
                    status: 401,
                    headers: {
                        "WWW-Authenticate":
                            'Bearer realm="currency-mcp.pollinations.ai"',
                    },
                },
            );
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

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};

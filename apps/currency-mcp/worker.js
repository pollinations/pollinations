import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

// ECB reference rates, published once per working day and served as JSON by
// Frankfurter. Keyless upstream: Gen checks the caller's key and never
// forwards it here, so this Worker holds no credentials of its own.
const FX_BASE_URL = "https://api.frankfurter.dev/v1";
const TIMEOUT_MS = 15000;
const COVERAGE_HINT =
    "Frankfurter publishes the ECB reference rates for about 30 currencies; call list_currencies to see them.";

class FxError extends Error {}

const currencyCode = z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine(
        (value) => /^[A-Z]{3}$/.test(value),
        "Use a three-letter ISO currency code, like USD or IDR.",
    );

const isoDate = z
    .string()
    .trim()
    .refine(
        (value) =>
            /^\d{4}-\d{2}-\d{2}$/.test(value) &&
            !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
        "Use an ISO date, YYYY-MM-DD.",
    );

function query(params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") search.set(key, value);
    }
    const text = search.toString();
    return text ? `?${text}` : "";
}

// Ponytail: no rate cache. ECB publishes once a working day and upstream is a
// static CDN, so a cache would only hide a stale-rate bug of our own.
async function fetchFx(path, fetchImpl = fetch) {
    let response;
    try {
        response = await fetchImpl(`${FX_BASE_URL}${path}`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch {
        throw new FxError(
            "The exchange-rate service did not respond in time. Try again shortly.",
        );
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const detail =
            typeof body?.message === "string"
                ? body.message
                : `HTTP ${response.status}`;
        throw new FxError(
            `Exchange-rate lookup failed: ${detail}. ${COVERAGE_HINT}`,
        );
    }
    return body;
}

function ratePath(date) {
    return date ? `/${date}` : "/latest";
}

// Money math stays in code: models round floated rates badly.
function round(value) {
    return Number(value.toFixed(6));
}

function textResult(value) {
    return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function buildServer() {
    const server = new McpServer(
        { name: "currency-mcp", title: "Currency MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "convert_currency",
        {
            description:
                "Convert an amount between currencies using the latest published ECB reference rate, " +
                "or the rate published on a given date. Feed the result into prices, invoices and " +
                "budgets instead of guessing an exchange rate. Returns the rate, the converted " +
                "amount and the date the rate is from (ECB does not publish on weekends or holidays, " +
                "so the date can precede the one you asked for).",
            inputSchema: {
                amount: z.number().positive().max(1e15),
                from: currencyCode,
                to: currencyCode,
                date: isoDate.optional(),
            },
        },
        async ({ amount, from, to, date }) => {
            if (from === to) {
                return textResult({
                    amount,
                    from,
                    to,
                    rate: 1,
                    result: amount,
                    date: date ?? null,
                });
            }
            const body = await fetchFx(
                `${ratePath(date)}${query({ base: from, symbols: to })}`,
            );
            const rate = body?.rates?.[to];
            if (typeof rate !== "number") {
                throw new FxError(
                    `No ${to} rate is published for ${body?.date}.`,
                );
            }
            return textResult({
                amount,
                from,
                to,
                rate,
                result: round(amount * rate),
                date: body.date,
            });
        },
    );

    server.registerTool(
        "exchange_rates",
        {
            description:
                "Every published reference rate for one base currency on the latest date, or on a " +
                "specific ISO date. Pass symbols to narrow the table; leave it out for all rates.",
            inputSchema: {
                base: currencyCode,
                symbols: z.array(currencyCode).min(1).max(30).optional(),
                date: isoDate.optional(),
            },
        },
        async ({ base, symbols, date }) => {
            const body = await fetchFx(
                `${ratePath(date)}${query({
                    base,
                    symbols: symbols?.join(","),
                })}`,
            );
            return textResult({
                base: body.base,
                date: body.date,
                rates: body.rates,
            });
        },
    );

    server.registerTool(
        "rate_history",
        {
            description:
                "Daily reference rates for one currency pair across a date window, with the change " +
                "and percentage change over the window. Working days only, so a window returns fewer " +
                "points than its calendar length.",
            inputSchema: {
                base: currencyCode,
                to: currencyCode,
                start: isoDate,
                end: isoDate,
            },
        },
        async ({ base, to, start, end }) => {
            if (start > end) {
                throw new FxError("Start date must not be after the end date.");
            }
            const body = await fetchFx(
                `/${start}..${end}${query({ base, symbols: to })}`,
            );
            const points = Object.entries(body?.rates ?? {})
                .map(([date, rates]) => ({ date, rate: rates?.[to] }))
                .filter(({ rate }) => typeof rate === "number");
            if (points.length === 0) {
                throw new FxError(
                    `No ${to} rates are published between ${start} and ${end}.`,
                );
            }
            const first = points[0];
            const last = points[points.length - 1];
            return textResult({
                base,
                to,
                start: body.start_date,
                end: body.end_date,
                first,
                last,
                change: round(last.rate - first.rate),
                changePercent: round(
                    ((last.rate - first.rate) / first.rate) * 100,
                ),
                points,
            });
        },
    );

    server.registerTool(
        "list_currencies",
        {
            description:
                "The currencies with a published ECB reference rate, as ISO code to name. Use it " +
                "before asking for a code that may not be covered.",
            inputSchema: {},
        },
        async () => {
            const body = await fetchFx("/currencies");
            return textResult({
                count: Object.keys(body).length,
                currencies: body,
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
                    'Bearer realm="currency-mcp.pollinations.ai"',
            },
        },
    );
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
                upstream: FX_BASE_URL,
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

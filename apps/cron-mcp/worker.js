import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { Cron } from "croner";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

function formatInTimeZone(date, timeZone) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23",
            timeZoneName: "longOffset",
        })
            .formatToParts(date)
            .map(({ type, value }) => [type, value]),
    );
    const offset =
        parts.timeZoneName === "GMT" ? "+00:00" : parts.timeZoneName.slice(3);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function nextRuns(expression, timeZone, start, count) {
    try {
        new Intl.DateTimeFormat("en", { timeZone });
    } catch {
        throw new Error(`Invalid IANA time zone: ${timeZone}`);
    }

    const startDate = start ? new Date(start) : new Date();
    let cron;
    try {
        cron = new Cron(expression, {
            mode: "5-part",
            paused: true,
            timezone: timeZone,
        });
    } catch (error) {
        throw new Error(`Invalid cron expression: ${error.message}`);
    }

    const runs = cron.nextRuns(count, startDate);
    return {
        expression,
        timezone: timeZone,
        start: startDate.toISOString(),
        day_matching:
            "day-of-month and day-of-week use standard cron OR semantics",
        runs: runs.map((date) => ({
            utc: date.toISOString(),
            local: formatInTimeZone(date, timeZone),
        })),
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "cron-mcp", title: "Cron MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "next_cron_runs",
        {
            description:
                "Validate a standard five-field Unix cron expression and return its next runs in UTC and an IANA time zone. Uses standard OR semantics when both day-of-month and day-of-week are restricted.",
            inputSchema: {
                expression: z
                    .string()
                    .trim()
                    .min(1)
                    .max(200)
                    .describe(
                        "Five fields: minute hour day-of-month month day-of-week",
                    ),
                timezone: z
                    .string()
                    .trim()
                    .min(1)
                    .max(100)
                    .optional()
                    .describe("IANA time zone; defaults to UTC"),
                start: z
                    .string()
                    .datetime({ offset: true })
                    .optional()
                    .describe(
                        "Exclusive RFC 3339 starting instant; defaults to now",
                    ),
                count: z
                    .number()
                    .int()
                    .min(1)
                    .max(20)
                    .optional()
                    .describe("Number of future runs; defaults to 5"),
            },
        },
        ({ expression, timezone = "UTC", start, count = 5 }) =>
            createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        nextRuns(expression, timezone, start, count),
                        null,
                        2,
                    ),
                ),
            ]),
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
                "WWW-Authenticate": 'Bearer realm="cron-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "cron-mcp",
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

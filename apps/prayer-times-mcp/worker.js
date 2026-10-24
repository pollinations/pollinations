import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const ALADHAN_BASE = "https://api.aladhan.com/v1";

const PRAYER_NAMES = [
    "Fajr",
    "Sunrise",
    "Dhuhr",
    "Asr",
    "Maghrib",
    "Isha",
    "Imsak",
];

async function aladhan(path, params = {}) {
    const url = new URL(`${ALADHAN_BASE}${path}`);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "")
            url.searchParams.set(k, String(v));
    });
    const response = await fetch(url.toString(), {
        headers: { "User-Agent": "prayer-times-mcp (pollinations)" },
    });
    if (!response.ok) {
        throw new Error(`aladhan.com returned HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.code !== 200) {
        throw new Error(`aladhan.com error: ${data.status ?? data.code}`);
    }
    return data.data;
}

function formatTimings(data) {
    const { timings = {}, date = {} } = data;
    const out = {};
    for (const name of PRAYER_NAMES) {
        if (timings[name]) out[name.toLowerCase()] = timings[name];
    }
    return {
        timings: out,
        gregorianDate: date.gregorian?.date ?? null,
        gregorianWeekday: date.gregorian?.weekday?.en ?? null,
        hijriDate: date.hijri?.date ?? null,
        hijriMonth: date.hijri?.month?.en ?? null,
        hijriYear: date.hijri?.year ?? null,
        hijriHoliday: date.hijri?.holidays?.length
            ? date.hijri.holidays[0]
            : null,
        calculationMethod: data.meta?.method?.name ?? null,
        timezone: data.meta?.timezone ?? null,
    };
}

function buildServer() {
    const server = new McpServer(
        {
            name: "prayer-times-mcp",
            title: "Prayer Times MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "prayer_times_by_coords",
        {
            description:
                "Get Islamic prayer times for a location using latitude/longitude. " +
                "Returns Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha, Imsak plus Gregorian and Hijri dates. " +
                "Uses aladhan.com (no API key needed).",
            inputSchema: {
                latitude: z.number().describe("Latitude, e.g. -6.2088"),
                longitude: z.number().describe("Longitude, e.g. 106.8456"),
                date: z
                    .string()
                    .optional()
                    .describe("Date DD-MM-YYYY (default today)"),
                method: z
                    .number()
                    .optional()
                    .describe(
                        "Calculation method id (default 20 = KEMENAG Indonesia)",
                    ),
            },
        },
        async ({ latitude, longitude, date, method = 20 }) => {
            const data = await aladhan(date ? `/timings/${date}` : "/timings", {
                latitude,
                longitude,
                method,
            });
            return createMCPResponse([
                createTextContent(JSON.stringify(formatTimings(data), null, 2)),
            ]);
        },
    );

    server.registerTool(
        "prayer_times_by_city",
        {
            description:
                "Get Islamic prayer times for a city name. " +
                "Returns the same fields as prayer_times_by_coords. Uses aladhan.com (no API key needed).",
            inputSchema: {
                city: z.string().describe("City name, e.g. Jakarta"),
                country: z
                    .string()
                    .describe("Country name or code, e.g. Indonesia or ID"),
                date: z
                    .string()
                    .optional()
                    .describe("Date DD-MM-YYYY (default today)"),
                method: z
                    .number()
                    .optional()
                    .describe(
                        "Calculation method id (default 20 = KEMENAG Indonesia)",
                    ),
            },
        },
        async ({ city, country, date, method = 20 }) => {
            const data = await aladhan(
                date ? `/timingsByCity/${date}` : "/timingsByCity",
                { city, country, method },
            );
            return createMCPResponse([
                createTextContent(JSON.stringify(formatTimings(data), null, 2)),
            ]);
        },
    );

    server.registerTool(
        "get_qibla",
        {
            description:
                "Get the Qibla direction (degrees from true north) for a location using latitude/longitude.",
            inputSchema: {
                latitude: z.number().describe("Latitude, e.g. -6.2088"),
                longitude: z.number().describe("Longitude, e.g. 106.8456"),
            },
        },
        async ({ latitude, longitude }) => {
            const data = await aladhan(`/qibla/${latitude}/${longitude}`);
            const result = {
                latitude,
                longitude,
                qiblaDirectionDegrees: data.direction ?? null,
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
                "WWW-Authenticate":
                    'Bearer realm="prayer-times-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "prayer-times-mcp",
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

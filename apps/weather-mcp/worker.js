import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// WMO weather interpretation codes from Open-Meteo's API docs.
const WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
};

function describeWeather(code) {
    return WEATHER_CODES[code] ?? `Weather code ${code}`;
}

// Open-Meteo needs no key, so the caller's Pollinations key is never forwarded.
async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.error) {
        const reason =
            body?.reason ||
            body?.error?.message ||
            `Open-Meteo request failed with status ${response.status}`;
        throw new Error(reason);
    }
    return body;
}

function buildServer() {
    const server = new McpServer(
        { name: "weather-mcp", title: "Weather MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "geocode",
        {
            description:
                "Look up places by name. Returns latitude, longitude, country, " +
                "timezone, elevation and population for each match, ready for " +
                "the weather tool.",
            inputSchema: {
                query: z
                    .string()
                    .min(1)
                    .describe("Place name, e.g. 'Gajraula' or 'New Delhi'"),
                count: z
                    .number()
                    .int()
                    .min(1)
                    .max(10)
                    .optional()
                    .describe("Maximum matches to return, 1-10 (default 5)"),
                language: z
                    .string()
                    .optional()
                    .describe(
                        "ISO 639-1 code for result names, e.g. 'en' (default) or 'hi'",
                    ),
            },
        },
        async ({ query, count, language }) => {
            const url = new URL(GEOCODING_URL);
            url.searchParams.set("name", query);
            url.searchParams.set("count", String(count ?? 5));
            url.searchParams.set("language", language ?? "en");
            url.searchParams.set("format", "json");
            const body = await fetchJson(url);
            const results = (body.results ?? []).map(
                ({
                    id,
                    name,
                    country,
                    admin1,
                    latitude,
                    longitude,
                    timezone,
                    elevation,
                    population,
                }) => ({
                    id,
                    name,
                    country,
                    admin1,
                    latitude,
                    longitude,
                    timezone,
                    elevation,
                    population,
                }),
            );
            return createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        results.length > 0
                            ? results
                            : { message: `No places found for "${query}"` },
                        null,
                        2,
                    ),
                ),
            ]);
        },
    );
    server.registerTool(
        "weather",
        {
            description:
                "Current conditions and up to a 7-day forecast for coordinates. " +
                "Use the geocode tool first to turn a place name into coordinates.",
            inputSchema: {
                latitude: z
                    .number()
                    .min(-90)
                    .max(90)
                    .describe("Decimal degrees north"),
                longitude: z
                    .number()
                    .min(-180)
                    .max(180)
                    .describe("Decimal degrees east"),
                days: z
                    .number()
                    .int()
                    .min(1)
                    .max(7)
                    .optional()
                    .describe("Forecast days, 1-7 (default 3)"),
            },
        },
        async ({ latitude, longitude, days }) => {
            const url = new URL(FORECAST_URL);
            url.searchParams.set("latitude", String(latitude));
            url.searchParams.set("longitude", String(longitude));
            url.searchParams.set(
                "current",
                "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
            );
            url.searchParams.set(
                "daily",
                "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
            );
            url.searchParams.set("timezone", "auto");
            url.searchParams.set("forecast_days", String(days ?? 3));
            const body = await fetchJson(url);
            const units = body.current_units ?? {};
            const current = body.current ?? {};
            const daily = body.daily ?? {};
            const report = {
                timezone: body.timezone,
                elevation_m: body.elevation,
                current: {
                    time: current.time,
                    conditions: describeWeather(current.weather_code),
                    temperature:
                        current.temperature_2m != null
                            ? `${current.temperature_2m}${units.temperature_2m ?? ""}`
                            : undefined,
                    apparent_temperature:
                        current.apparent_temperature != null
                            ? `${current.apparent_temperature}${units.apparent_temperature ?? ""}`
                            : undefined,
                    humidity:
                        current.relative_humidity_2m != null
                            ? `${current.relative_humidity_2m}${units.relative_humidity_2m ?? ""}`
                            : undefined,
                    wind_speed:
                        current.wind_speed_10m != null
                            ? `${current.wind_speed_10m}${units.wind_speed_10m ?? ""}`
                            : undefined,
                },
                daily: (daily.time ?? []).map((date, index) => ({
                    date,
                    conditions: describeWeather(daily.weather_code?.[index]),
                    high:
                        daily.temperature_2m_max?.[index] != null
                            ? `${daily.temperature_2m_max[index]}${body.daily_units?.temperature_2m_max ?? ""}`
                            : undefined,
                    low:
                        daily.temperature_2m_min?.[index] != null
                            ? `${daily.temperature_2m_min[index]}${body.daily_units?.temperature_2m_min ?? ""}`
                            : undefined,
                    precipitation_sum:
                        daily.precipitation_sum?.[index] != null
                            ? `${daily.precipitation_sum[index]}${body.daily_units?.precipitation_sum ?? ""}`
                            : undefined,
                    precipitation_probability:
                        daily.precipitation_probability_max?.[index] != null
                            ? `${daily.precipitation_probability_max[index]}${body.daily_units?.precipitation_probability_max ?? ""}`
                            : undefined,
                    max_wind_speed:
                        daily.wind_speed_10m_max?.[index] != null
                            ? `${daily.wind_speed_10m_max[index]}${body.daily_units?.wind_speed_10m_max ?? ""}`
                            : undefined,
                })),
            };
            return createMCPResponse([
                createTextContent(JSON.stringify(report, null, 2)),
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
                    'Bearer realm="weather-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "weather-mcp",
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

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

// European AQI bands from the European Environment Agency index.
function describeEuropeanAqi(aqi) {
    if (aqi == null) return undefined;
    if (aqi <= 20) return "Good";
    if (aqi <= 40) return "Fair";
    if (aqi <= 60) return "Moderate";
    if (aqi <= 80) return "Poor";
    if (aqi <= 100) return "Very poor";
    return "Extremely poor";
}

// US EPA AQI bands.
function describeUsAqi(aqi) {
    if (aqi == null) return undefined;
    if (aqi <= 50) return "Good";
    if (aqi <= 100) return "Moderate";
    if (aqi <= 150) return "Unhealthy for sensitive groups";
    if (aqi <= 200) return "Unhealthy";
    if (aqi <= 300) return "Very unhealthy";
    return "Hazardous";
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

const CURRENT_VARS = [
    "european_aqi",
    "us_aqi",
    "pm10",
    "pm2_5",
    "carbon_monoxide",
    "nitrogen_dioxide",
    "sulphur_dioxide",
    "ozone",
];
const POLLEN_VARS = [
    "alder_pollen",
    "birch_pollen",
    "grass_pollen",
    "mugwort_pollen",
    "olive_pollen",
    "ragweed_pollen",
];

function round(value) {
    return value == null ? undefined : Math.round(value * 100) / 100;
}

async function fetchAirQuality({ latitude, longitude, days, pollen }) {
    const url = new URL(AIR_QUALITY_URL);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set(
        "current",
        CURRENT_VARS.concat(pollen ? POLLEN_VARS : []).join(","),
    );
    if (days > 0) {
        url.searchParams.set("daily", "european_aqi,us_aqi,pm2_5,pm10,ozone");
        url.searchParams.set("forecast_days", String(days));
        url.searchParams.set("timezone", "auto");
    }
    const body = await fetchJson(url);
    const current = body.current ?? {};
    const daily = body.daily ?? {};
    const report = {
        timezone: body.timezone,
        elevation_m: body.elevation,
        current: {
            time: current.time,
            european_aqi: current.european_aqi,
            european_aqi_band: describeEuropeanAqi(current.european_aqi),
            us_aqi: current.us_aqi,
            us_aqi_band: describeUsAqi(current.us_aqi),
            pm2_5_ugm3: round(current.pm2_5),
            pm10_ugm3: round(current.pm10),
            ozone_ugm3: round(current.ozone),
            nitrogen_dioxide_ugm3: round(current.nitrogen_dioxide),
            sulphur_dioxide_ugm3: round(current.sulphur_dioxide),
            carbon_monoxide_ugm3: round(current.carbon_monoxide),
            ...(pollen
                ? {
                      pollen_ugm3: {
                          alder: round(current.alder_pollen),
                          birch: round(current.birch_pollen),
                          grass: round(current.grass_pollen),
                          mugwort: round(current.mugwort_pollen),
                          olive: round(current.olive_pollen),
                          ragweed: round(current.ragweed_pollen),
                      },
                  }
                : {}),
        },
    };
    if (days > 0) {
        report.daily = (daily.time ?? []).map((date, index) => ({
            date,
            european_aqi: daily.european_aqi?.[index],
            european_aqi_band: describeEuropeanAqi(daily.european_aqi?.[index]),
            us_aqi: daily.us_aqi?.[index],
            us_aqi_band: describeUsAqi(daily.us_aqi?.[index]),
            pm2_5_ugm3: round(daily.pm2_5?.[index]),
            pm10_ugm3: round(daily.pm10?.[index]),
            ozone_ugm3: round(daily.ozone?.[index]),
        }));
    }
    return report;
}

function buildServer() {
    const server = new McpServer(
        { name: "air-quality-mcp", title: "Air Quality MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "air_quality",
        {
            description:
                "Current air quality for coordinates: European and US AQI with " +
                "plain-language bands, PM2.5, PM10, ozone, NO2, SO2 and CO, plus " +
                "an optional daily forecast and European pollen counts. Get " +
                "coordinates from any geocoder, or use air_quality_by_place.",
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
                    .min(0)
                    .max(5)
                    .optional()
                    .describe(
                        "Daily forecast days, 0-5 (default 0, current only)",
                    ),
                pollen: z
                    .boolean()
                    .optional()
                    .describe(
                        "Include current pollen grains per cubic metre (Europe only)",
                    ),
            },
        },
        async ({ latitude, longitude, days, pollen }) => {
            const report = await fetchAirQuality({
                latitude,
                longitude,
                days: days ?? 0,
                pollen: pollen ?? false,
            });
            return createMCPResponse([
                createTextContent(JSON.stringify(report, null, 2)),
            ]);
        },
    );
    server.registerTool(
        "air_quality_by_place",
        {
            description:
                "Current air quality for a place name. Geocodes the name to its " +
                "best match, then returns the same readings as air_quality " +
                "together with the resolved location.",
            inputSchema: {
                query: z
                    .string()
                    .min(1)
                    .describe("Place name, e.g. 'Delhi' or 'Milan'"),
                days: z
                    .number()
                    .int()
                    .min(0)
                    .max(5)
                    .optional()
                    .describe(
                        "Daily forecast days, 0-5 (default 0, current only)",
                    ),
                pollen: z
                    .boolean()
                    .optional()
                    .describe(
                        "Include current pollen grains per cubic metre (Europe only)",
                    ),
            },
        },
        async ({ query, days, pollen }) => {
            const geoUrl = new URL(GEOCODING_URL);
            geoUrl.searchParams.set("name", query);
            geoUrl.searchParams.set("count", "1");
            geoUrl.searchParams.set("language", "en");
            geoUrl.searchParams.set("format", "json");
            const geo = await fetchJson(geoUrl);
            const place = geo.results?.[0];
            if (!place) {
                throw new Error(`No places found for "${query}"`);
            }
            const report = await fetchAirQuality({
                latitude: place.latitude,
                longitude: place.longitude,
                days: days ?? 0,
                pollen: pollen ?? false,
            });
            return createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        {
                            place: {
                                name: place.name,
                                country: place.country,
                                admin1: place.admin1,
                                latitude: place.latitude,
                                longitude: place.longitude,
                                timezone: place.timezone,
                            },
                            air_quality: report,
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
                "WWW-Authenticate":
                    'Bearer realm="air-quality-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "air-quality-mcp",
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

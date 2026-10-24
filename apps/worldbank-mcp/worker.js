import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const SERVER_NAME = "worldbank-mcp";
const API_ROOT = "https://api.worldbank.org/v2";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_OBSERVATIONS = 2_000;
// The caller's Pollinations key authenticates the proxy. The World Bank API is
// public, so the key is never forwarded upstream.
const UPSTREAM_HEADERS = {
    Accept: "application/json",
    "User-Agent": `pollinations-${SERVER_NAME} (https://pollinations.ai)`,
};

const TOPICS = [
    "economy",
    "population",
    "health",
    "education",
    "environment",
    "labor",
    "poverty",
    "trade",
    "technology",
    "government",
];

// A short, stable catalog of the indicators agents ask for most. Any other
// World Bank indicator code still works with get_indicator_data.
const INDICATORS = [
    {
        code: "NY.GDP.MKTP.CD",
        name: "GDP (current US$)",
        topic: "economy",
        unit: "current US$",
    },
    {
        code: "NY.GDP.PCAP.CD",
        name: "GDP per capita (current US$)",
        topic: "economy",
        unit: "current US$",
    },
    {
        code: "NY.GDP.MKTP.KD.ZG",
        name: "GDP growth (annual %)",
        topic: "economy",
        unit: "annual %",
    },
    {
        code: "NY.GDP.MKTP.PP.CD",
        name: "GDP, PPP (current international $)",
        topic: "economy",
        unit: "current international $",
    },
    {
        code: "FP.CPI.TOTL.ZG",
        name: "Inflation, consumer prices (annual %)",
        topic: "economy",
        unit: "annual %",
    },
    {
        code: "GC.DOD.TOTL.GD.ZS",
        name: "Central government debt (total, % of GDP)",
        topic: "government",
        unit: "% of GDP",
    },
    {
        code: "BN.CAB.XOKA.GD.ZS",
        name: "Current account balance (% of GDP)",
        topic: "trade",
        unit: "% of GDP",
    },
    {
        code: "SP.POP.TOTL",
        name: "Population, total",
        topic: "population",
        unit: "people",
    },
    {
        code: "SP.POP.GROW",
        name: "Population growth (annual %)",
        topic: "population",
        unit: "annual %",
    },
    {
        code: "SP.URB.TOTL.IN.ZS",
        name: "Urban population (% of total population)",
        topic: "population",
        unit: "% of total",
    },
    {
        code: "SP.DYN.LE00.IN",
        name: "Life expectancy at birth (years)",
        topic: "health",
        unit: "years",
    },
    {
        code: "SP.DYN.TFRT.IN",
        name: "Fertility rate (births per woman)",
        topic: "health",
        unit: "births per woman",
    },
    {
        code: "SP.DYN.IMRT.IN",
        name: "Infant mortality rate (per 1,000 live births)",
        topic: "health",
        unit: "per 1,000 live births",
    },
    {
        code: "SH.DYN.MORT",
        name: "Mortality rate, under-5 (per 1,000 live births)",
        topic: "health",
        unit: "per 1,000 live births",
    },
    {
        code: "SH.XPD.CHEX.GD.ZS",
        name: "Current health expenditure (% of GDP)",
        topic: "health",
        unit: "% of GDP",
    },
    {
        code: "SH.MED.PHYS.ZS",
        name: "Physicians (per 1,000 people)",
        topic: "health",
        unit: "per 1,000 people",
    },
    {
        code: "SH.MED.BEDS.ZS",
        name: "Hospital beds (per 1,000 people)",
        topic: "health",
        unit: "per 1,000 people",
    },
    {
        code: "SE.XPD.TOTL.GD.ZS",
        name: "Government expenditure on education (% of GDP)",
        topic: "education",
        unit: "% of GDP",
    },
    {
        code: "SE.ADT.LITR.ZS",
        name: "Literacy rate, adult total (% of people 15+)",
        topic: "education",
        unit: "% of people 15+",
    },
    {
        code: "SE.PRM.ENRR",
        name: "School enrollment, primary (% gross)",
        topic: "education",
        unit: "% gross",
    },
    {
        code: "SE.TER.ENRR",
        name: "School enrollment, tertiary (% gross)",
        topic: "education",
        unit: "% gross",
    },
    {
        code: "SL.UEM.TOTL.ZS",
        name: "Unemployment, total (% of labor force)",
        topic: "labor",
        unit: "% of labor force",
    },
    {
        code: "SL.TLF.CACT.ZS",
        name: "Labor force participation rate (% of population 15+)",
        topic: "labor",
        unit: "% of population 15+",
    },
    {
        code: "SI.POV.DDAY",
        name: "Poverty headcount ratio at $2.15 a day (2021 PPP, % of population)",
        topic: "poverty",
        unit: "% of population",
    },
    {
        code: "SI.POV.GINI",
        name: "Gini index",
        topic: "poverty",
        unit: "index 0-100",
    },
    {
        code: "IT.NET.USER.ZS",
        name: "Individuals using the Internet (% of population)",
        topic: "technology",
        unit: "% of population",
    },
    {
        code: "IT.CEL.SETS.P2",
        name: "Mobile cellular subscriptions (per 100 people)",
        topic: "technology",
        unit: "per 100 people",
    },
    {
        code: "EG.USE.ELEC.KH.PC",
        name: "Electric power consumption (kWh per capita)",
        topic: "environment",
        unit: "kWh per capita",
    },
    {
        code: "EG.ELC.ACCS.ZS",
        name: "Access to electricity (% of population)",
        topic: "environment",
        unit: "% of population",
    },
    {
        code: "EN.GHG.CO2.PC.CE.AR5",
        name: "CO2 emissions (metric tons per capita, AR5)",
        topic: "environment",
        unit: "metric tons per capita",
    },
    {
        code: "AG.LND.FRST.ZS",
        name: "Forest area (% of land area)",
        topic: "environment",
        unit: "% of land area",
    },
    {
        code: "ER.H2O.FWTL.ZS",
        name: "Annual freshwater withdrawals (% of internal resources)",
        topic: "environment",
        unit: "% of internal resources",
    },
    {
        code: "NE.EXP.GNFS.ZS",
        name: "Exports of goods and services (% of GDP)",
        topic: "trade",
        unit: "% of GDP",
    },
    {
        code: "NE.IMP.GNFS.ZS",
        name: "Imports of goods and services (% of GDP)",
        topic: "trade",
        unit: "% of GDP",
    },
    {
        code: "BX.KLT.DINV.WD.GD.ZS",
        name: "Foreign direct investment, net inflows (% of GDP)",
        topic: "trade",
        unit: "% of GDP",
    },
    {
        code: "BX.TRF.PWKR.DT.GD.ZS",
        name: "Personal remittances received (% of GDP)",
        topic: "trade",
        unit: "% of GDP",
    },
    {
        code: "NV.AGR.TOTL.ZS",
        name: "Agriculture, forestry, and fishing value added (% of GDP)",
        topic: "economy",
        unit: "% of GDP",
    },
    {
        code: "NV.IND.TOTL.ZS",
        name: "Industry value added (% of GDP)",
        topic: "economy",
        unit: "% of GDP",
    },
    {
        code: "NV.SRV.TOTL.ZS",
        name: "Services value added (% of GDP)",
        topic: "economy",
        unit: "% of GDP",
    },
    {
        code: "MS.MIL.XPND.GD.ZS",
        name: "Military expenditure (% of GDP)",
        topic: "government",
        unit: "% of GDP",
    },
    {
        code: "GB.XPD.RSDV.GD.ZS",
        name: "Research and development expenditure (% of GDP)",
        topic: "government",
        unit: "% of GDP",
    },
];

const indicatorSchema = z
    .string()
    .min(1)
    .max(100)
    .describe(
        "World Bank indicator code such as NY.GDP.MKTP.CD, or words from a catalog name such as GDP per capita.",
    );

const countrySchema = z
    .string()
    .regex(/^[A-Za-z]{2,3}$/)
    .describe("ISO 3166 country code, two or three letters (US or USA).");

function textResult(value) {
    return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    };
}

async function fetchJson(url, label) {
    let response;
    try {
        response = await fetch(url, {
            headers: UPSTREAM_HEADERS,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        throw new Error(
            `${label} is unreachable right now. Try again shortly.`,
        );
    }

    const body = await response.text();
    if (!response.ok) {
        throw new Error(
            `${label} error (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`,
        );
    }
    try {
        return JSON.parse(body);
    } catch {
        throw new Error(`${label} returned invalid JSON.`);
    }
}

function resolveIndicator(input) {
    const value = input.trim();
    const byCode = INDICATORS.find(
        (indicator) => indicator.code.toUpperCase() === value.toUpperCase(),
    );
    if (byCode) return byCode;
    if (/^[A-Za-z][A-Za-z0-9]{1,20}(\.[A-Za-z0-9]{1,20})+$/.test(value)) {
        return {
            code: value.toUpperCase(),
            name: null,
            unit: null,
            topic: null,
        };
    }
    const needle = value.toLowerCase();
    const byName =
        INDICATORS.find(
            (indicator) => indicator.name.toLowerCase() === needle,
        ) ??
        INDICATORS.find((indicator) =>
            indicator.name.toLowerCase().includes(needle),
        );
    if (byName) return byName;
    throw new Error(
        `Unknown indicator "${input}". Use search_indicators to find a code.`,
    );
}

function worldBankError(payload, fallback) {
    const message = payload?.[0]?.message?.[0]?.value;
    return new Error(`${fallback}${message ? `: ${message}` : ""}.`);
}

function buildServer() {
    const server = new McpServer(
        { name: SERVER_NAME, title: "World Bank", version: "0.1.0" },
        {
            instructions:
                "Query World Bank development data. search_indicators lists common indicator codes; get_indicator_data returns yearly values for countries; list_countries resolves country codes and regions. Values can be missing for recent years, so request several years and prefer the newest non-null observation.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "search_indicators",
        {
            title: "Search indicators",
            description:
                "Search the built-in catalog of widely used World Bank indicators by name, code, or topic. Use the returned code with get_indicator_data; any other official indicator code also works.",
            inputSchema: z.object({
                query: z
                    .string()
                    .min(1)
                    .max(100)
                    .optional()
                    .describe(
                        "Words to match against indicator names or codes.",
                    ),
                topic: z
                    .enum(TOPICS)
                    .optional()
                    .describe("Restrict results to one topic."),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(50)
                    .default(20)
                    .describe("Maximum number of indicators to return."),
            }),
        },
        async ({ query, topic, limit }) => {
            const needle = query?.toLowerCase();
            const indicators = INDICATORS.filter((indicator) => {
                if (topic && indicator.topic !== topic) return false;
                if (!needle) return true;
                return (
                    indicator.code.toLowerCase().includes(needle) ||
                    indicator.name.toLowerCase().includes(needle)
                );
            }).slice(0, limit);
            return textResult({
                count: indicators.length,
                indicators,
            });
        },
    );

    server.registerTool(
        "get_indicator_data",
        {
            title: "Get indicator data",
            description:
                "Fetch yearly values of a World Bank indicator for up to ten countries. Returns the newest observations first and omits missing values. Use this for comparisons over time or across countries.",
            inputSchema: z.object({
                indicator: indicatorSchema,
                countries: z
                    .array(countrySchema)
                    .min(1)
                    .max(10)
                    .default(["US"])
                    .describe(
                        'Countries to include, for example ["US", "CN"].',
                    ),
                start_year: z
                    .number()
                    .int()
                    .min(1960)
                    .max(2100)
                    .optional()
                    .describe(
                        "First year to include. Defaults to ten years ago.",
                    ),
                end_year: z
                    .number()
                    .int()
                    .min(1960)
                    .max(2100)
                    .optional()
                    .describe(
                        "Last year to include. Defaults to the current year.",
                    ),
                limit_per_country: z
                    .number()
                    .int()
                    .min(1)
                    .max(30)
                    .default(5)
                    .describe("Newest observations to return per country."),
            }),
        },
        async ({
            indicator,
            countries,
            start_year,
            end_year,
            limit_per_country,
        }) => {
            const resolved = resolveIndicator(indicator);
            const endYear = end_year ?? new Date().getUTCFullYear();
            const startYear = start_year ?? endYear - 10;
            if (startYear > endYear) {
                throw new Error("start_year must not be after end_year.");
            }

            const codes = countries.map((code) => code.toUpperCase());
            const url = new URL(
                `${API_ROOT}/country/${codes.join(";")}/indicator/${resolved.code}`,
            );
            url.search = new URLSearchParams({
                format: "json",
                per_page: String(MAX_OBSERVATIONS),
                date: `${startYear}:${endYear}`,
            }).toString();

            const payload = await fetchJson(url, "World Bank data");
            const rows = payload?.[1];
            if (!Array.isArray(rows)) {
                throw worldBankError(
                    payload,
                    "World Bank rejected the request",
                );
            }

            const byCountry = new Map();
            for (const row of rows) {
                if (row.value === null || row.value === undefined) continue;
                const key = row.countryiso3code ?? row.country?.id ?? "unknown";
                if (!byCountry.has(key)) {
                    byCountry.set(key, {
                        country: row.country?.value ?? key,
                        country_code: key,
                        observations: [],
                    });
                }
                byCountry.get(key).observations.push({
                    year: row.date,
                    value: row.value,
                });
            }

            const data = [...byCountry.values()].map((entry) => ({
                ...entry,
                observations: entry.observations
                    .sort((a, b) =>
                        String(b.year).localeCompare(String(a.year)),
                    )
                    .slice(0, limit_per_country),
            }));

            return textResult({
                indicator: {
                    code: resolved.code,
                    name: payload?.[0]?.indicator?.value ?? resolved.name,
                    unit: resolved.unit,
                },
                countries: data,
                requested_countries: codes,
                years: { start: startYear, end: endYear },
            });
        },
    );

    server.registerTool(
        "list_countries",
        {
            title: "List countries",
            description:
                "Look up World Bank country codes, regions, income levels, and capitals. Filter by name or code fragment.",
            inputSchema: z.object({
                query: z
                    .string()
                    .min(1)
                    .max(100)
                    .optional()
                    .describe(
                        "Match against country name, ISO code, or region, for example Africa or DEU.",
                    ),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(100)
                    .default(20)
                    .describe("Maximum number of countries to return."),
            }),
        },
        async ({ query, limit }) => {
            const url = new URL(`${API_ROOT}/country`);
            url.search = new URLSearchParams({
                format: "json",
                per_page: "400",
            }).toString();
            const payload = await fetchJson(url, "World Bank countries");
            const rows = payload?.[1];
            if (!Array.isArray(rows)) {
                throw worldBankError(
                    payload,
                    "World Bank rejected the request",
                );
            }
            const needle = query?.toLowerCase();
            const matches = rows.filter((row) => {
                if (!needle) return true;
                return [row.name, row.id, row.iso2Code, row.region?.value]
                    .filter(Boolean)
                    .some((value) => value.toLowerCase().includes(needle));
            });
            return textResult({
                total: matches.length,
                countries: matches.slice(0, limit).map((row) => ({
                    iso3: row.id ?? null,
                    iso2: row.iso2Code ?? null,
                    name: row.name ?? null,
                    region: row.region?.value?.trim() || null,
                    income_level: row.incomeLevel?.value ?? null,
                    capital: row.capitalCity || null,
                    latitude: row.latitude ? Number(row.latitude) : null,
                    longitude: row.longitude ? Number(row.longitude) : null,
                })),
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
                "WWW-Authenticate": `Bearer realm="${SERVER_NAME}.pollinations.ai"`,
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: SERVER_NAME,
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

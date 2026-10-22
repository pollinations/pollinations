import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

// conversion to base unit per category: name -> [factor, offset]
const UNITS = {
    length: {
        m: 1,
        km: 1000,
        cm: 0.01,
        mm: 0.001,
        mi: 1609.344,
        yd: 0.9144,
        ft: 0.3048,
        in: 0.0254,
        nm: 1852,
    },
    mass: {
        kg: 1,
        g: 0.001,
        mg: 0.000001,
        t: 1000,
        lb: 0.45359237,
        oz: 0.028349523125,
        st: 6.35029318,
    },
    temperature: { c: 1, f: null, k: 1, r: null }, // special-cased
    speed: {
        "m/s": 1,
        "km/h": 0.2777778,
        "mph": 0.44704,
        knot: 0.5144444,
        "ft/s": 0.3048,
    },
    data: {
        b: 1,
        kb: 1024,
        mb: 1024 ** 2,
        gb: 1024 ** 3,
        tb: 1024 ** 4,
        pb: 1024 ** 5,
    },
    time: {
        s: 1,
        ms: 0.001,
        min: 60,
        h: 3600,
        d: 86400,
        wk: 604800,
        mo: 2629746,
        yr: 31556952,
    },
    area: {
        "m2": 1,
        "km2": 1e6,
        "cm2": 1e-4,
        "ha": 10000,
        ac: 4046.8564224,
        "ft2": 0.09290304,
        "mi2": 2589988.110336,
    },
    volume: {
        l: 1,
        ml: 0.001,
        "m3": 1000,
        gal: 3.785411784,
        "ft3": 28.316846592,
        cup: 0.2365882365,
        tbsp: 0.0147867648,
        tsp: 0.0049289216,
    },
};

const CATEGORY_ALIASES = {
    length: ["length", "distance", "panjang", "jarak"],
    mass: ["mass", "weight", "berat", "massa"],
    temperature: ["temperature", "temp", "suhu"],
    speed: ["speed", "velocity", "kecepatan"],
    data: ["data", "storage", "bytes", "penyimpanan"],
    time: ["time", "durasi", "waktu"],
    area: ["area", "luas"],
    volume: ["volume", "vol", "isi"],
};

function resolveCategory(name) {
    const n = String(name || "").toLowerCase();
    for (const [cat, aliases] of Object.entries(CATEGORY_ALIASES)) {
        if (aliases.includes(n) || UNITS[cat][n] !== undefined) return cat;
    }
    return null;
}

function convertTemp(value, from, to) {
    // normalize to celsius
    let c;
    switch (from) {
        case "c":
            c = value;
            break;
        case "f":
            c = ((value - 32) * 5) / 9;
            break;
        case "k":
            c = value - 273.15;
            break;
        case "r":
            c = ((value - 491.67) * 5) / 9;
            break;
        default:
            return null;
    }
    switch (to) {
        case "c":
            return c;
        case "f":
            return (c * 9) / 5 + 32;
        case "k":
            return c + 273.15;
        case "r":
            return (c * 9) / 5 + 491.67;
        default:
            return null;
    }
}

function convert(value, from, to, category) {
    if (category === "temperature") {
        const r = convertTemp(value, from, to);
        return r === null
            ? null
            : {
                  value: r,
                  unit: to === "k" || to === "r" ? to.toUpperCase() : to,
              };
    }
    const a = UNITS[category][from];
    const b = UNITS[category][to];
    if (a === undefined || b === undefined) return null;
    return { value: (value * a) / b, unit: to };
}

function buildServer() {
    const server = new McpServer(
        { name: "units-mcp", title: "Units Converter MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "convert",
        {
            description:
                "Convert a value between units within a category: length, mass, temperature, speed, data, time, area, volume. " +
                "Temperature supports c, f, k, r (rankine). Examples: convert 10 mi to km, convert 300 k to c, convert 2 gb to mb.",
            inputSchema: {
                value: z.number().describe("Numeric value to convert"),
                from: z
                    .string()
                    .describe("Source unit, e.g. mi, km, c, f, gb, h"),
                to: z.string().describe("Target unit, e.g. km, c, mb, min"),
                category: z
                    .string()
                    .optional()
                    .describe(
                        "Category hint: length, mass, temperature, speed, data, time, area, volume",
                    ),
            },
        },
        async ({ value, from, to, category }) => {
            const fromKey = String(from).toLowerCase();
            const toKey = String(to).toLowerCase();
            const cat =
                resolveCategory(category) ||
                resolveCategory(fromKey) ||
                resolveCategory(toKey);
            if (!cat) {
                return createMCPResponse([
                    createTextContent(
                        `Cannot determine unit category. Supported: ${Object.keys(UNITS).join(", ")}`,
                    ),
                ]);
            }
            if (
                UNITS[cat][fromKey] === undefined &&
                !(
                    cat === "temperature" &&
                    ["c", "f", "k", "r"].includes(fromKey)
                )
            ) {
                return createMCPResponse([
                    createTextContent(
                        `Unknown unit "${from}" in category ${cat}.`,
                    ),
                ]);
            }
            if (
                UNITS[cat][toKey] === undefined &&
                !(cat === "temperature" && ["c", "f", "k", "r"].includes(toKey))
            ) {
                return createMCPResponse([
                    createTextContent(
                        `Unknown unit "${to}" in category ${cat}.`,
                    ),
                ]);
            }
            const result = convert(value, fromKey, toKey, cat);
            if (!result)
                return createMCPResponse([
                    createTextContent("Conversion failed."),
                ]);
            const display = (n) =>
                Number.isInteger(n)
                    ? String(n)
                    : String(Math.round(n * 1e10) / 1e10);
            return createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        {
                            category: cat,
                            from: `${display(value)} ${fromKey}`,
                            to: `${display(result.value)} ${result.unit}`,
                            value: result.value,
                            unit: result.unit,
                        },
                        null,
                        2,
                    ),
                ),
            ]);
        },
    );

    server.registerTool(
        "list_units",
        {
            description:
                "List all supported units for a category: length, mass, temperature, speed, data, time, area, volume.",
            inputSchema: {
                category: z.string().describe("Category name"),
            },
        },
        async ({ category }) => {
            const cat = resolveCategory(category);
            if (!cat) {
                return createMCPResponse([
                    createTextContent(
                        `Unknown category. Supported: ${Object.keys(UNITS).join(", ")}`,
                    ),
                ]);
            }
            return createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        { category: cat, units: Object.keys(UNITS[cat]) },
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
                "WWW-Authenticate": 'Bearer realm="units-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "units-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }
        if (url.pathname !== "/")
            return new Response("Not found", { status: 404 });
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
            authInfo: { token, clientId: "pollinations-api-key", scopes: [] },
        });
    },
};

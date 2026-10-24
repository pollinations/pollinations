import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const NAMED = {
    black: [0, 0, 0],
    white: [255, 255, 255],
    red: [255, 0, 0],
    lime: [0, 255, 0],
    blue: [0, 0, 255],
    yellow: [255, 255, 0],
    cyan: [0, 255, 255],
    magenta: [255, 0, 255],
    silver: [192, 192, 192],
    gray: [128, 128, 128],
    maroon: [128, 0, 0],
    olive: [128, 128, 0],
    green: [0, 128, 0],
    purple: [128, 0, 128],
    teal: [0, 128, 128],
    navy: [0, 0, 128],
    orange: [255, 165, 0],
    pink: [255, 192, 203],
    brown: [165, 42, 42],
    gold: [255, 215, 0],
    coral: [255, 127, 80],
    crimson: [220, 20, 60],
    indigo: [75, 0, 130],
    khaki: [240, 230, 140],
    lavender: [230, 230, 250],
    salmon: [250, 128, 114],
    seagreen: [46, 139, 87],
    skyblue: [135, 206, 235],
    tomato: [255, 99, 71],
    violet: [238, 130, 238],
    wheat: [245, 222, 179],
};

function clamp(v, lo = 0, hi = 255) {
    return Math.max(lo, Math.min(hi, Math.round(v)));
}

function hexToRgb(hex) {
    let h = hex.replace("#", "").trim();
    if (h.length === 3)
        h = h
            .split("")
            .map((c) => c + c)
            .join("");
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

function rgbToHex(r, g, b) {
    return (
        "#" +
        [r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")
    );
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    let h = 0,
        s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            default:
                h = (r - g) / d + 4;
        }
        h /= 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const sHue = [h + 1 / 3, h, h - 1 / 3];
    return sHue.map((x) => Math.round(hue2rgb(p, q, x) * 255));
}

function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            default:
                h = (r - g) / d + 4;
        }
        h *= 60;
    }
    return [
        Math.round(h),
        max === 0 ? 0 : Math.round((d / max) * 100),
        Math.round(max * 100),
    ];
}

function parseColor(input) {
    const s = String(input).trim().toLowerCase();
    if (NAMED[s]) {
        const [r, g, b] = NAMED[s];
        return { r, g, b, name: s };
    }
    const hex = hexToRgb(s);
    if (hex) return { r: hex[0], g: hex[1], b: hex[2] };
    const mRgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (mRgb) return { r: +mRgb[1], g: +mRgb[2], b: +mRgb[3] };
    const mHsl = s.match(/^hsla?\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%/);
    if (mHsl) {
        const [r, g, b] = hslToRgb(+mHsl[1], +mHsl[2], +mHsl[3]);
        return { r, g, b };
    }
    return null;
}

function colorInfo(input) {
    const c = parseColor(input);
    if (!c) return null;
    const { r, g, b } = c;
    return {
        input,
        hex: rgbToHex(r, g, b),
        rgb: `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`,
        hsl: `hsl(${rgbToHsl(r, g, b)[0]}, ${rgbToHsl(r, g, b)[1]}%, ${rgbToHsl(r, g, b)[2]}%)`,
        hsv: rgbToHsv(r, g, b),
        name: c.name ?? null,
    };
}

function rotateHue(r, g, b, deg) {
    const [h, s, l] = rgbToHsl(r, g, b);
    const [nr, ng, nb] = hslToRgb(h + deg, s, l);
    return rgbToHex(nr, ng, nb);
}

function luminance(r, g, b) {
    const f = (v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a, b) {
    const la = luminance(a.r, a.g, a.b);
    const lb = luminance(b.r, b.g, b.b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

function buildServer() {
    const server = new McpServer(
        { name: "color-mcp", title: "Color MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "parse_color",
        {
            description:
                "Parse a color from hex, rgb(), hsl(), or a CSS color name and return normalized hex, rgb, hsl, hsv values.",
            inputSchema: {
                color: z
                    .string()
                    .describe(
                        "Color: #ff0000, red, rgb(255,0,0), hsl(0,100%,50%)",
                    ),
            },
        },
        async ({ color }) => {
            const info = colorInfo(color);
            if (!info) {
                return createMCPResponse([
                    createTextContent(`Could not parse color: ${color}`),
                ]);
            }
            return createMCPResponse([
                createTextContent(JSON.stringify(info, null, 2)),
            ]);
        },
    );

    server.registerTool(
        "generate_palette",
        {
            description:
                "Generate a color palette from a base color using a scheme: monochromatic, analogous, complementary, or triadic.",
            inputSchema: {
                baseColor: z
                    .string()
                    .describe("Base color (hex, name, rgb or hsl)"),
                scheme: z
                    .enum([
                        "monochromatic",
                        "analogous",
                        "complementary",
                        "triadic",
                    ])
                    .optional()
                    .describe("Palette scheme (default analogous)"),
                count: z
                    .number()
                    .int()
                    .min(2)
                    .max(8)
                    .optional()
                    .describe("Number of colors (default 5)"),
            },
        },
        async ({ baseColor, scheme = "analogous", count = 5 }) => {
            const c = parseColor(baseColor);
            if (!c) {
                return createMCPResponse([
                    createTextContent(`Could not parse color: ${baseColor}`),
                ]);
            }
            const [h, s, l] = rgbToHsl(c.r, c.g, c.b);
            const palette = [];
            const steps = Math.max(count - 1, 1);
            for (let i = 0; i < count; i++) {
                let hh = h,
                    ss = s,
                    ll = l;
                if (scheme === "monochromatic")
                    ll = clamp(l + (i - steps / 2) * 12, 2, 98);
                if (scheme === "analogous") hh = h + (i - steps / 2) * 15;
                if (scheme === "complementary") {
                    hh =
                        h +
                        (i % 2 === 0 ? 0 : 180) +
                        Math.round((i - steps / 2) * 4);
                }
                if (scheme === "triadic") hh = h + (i % 3) * 120;
                const [r, g, b] = hslToRgb(hh, ss, ll);
                palette.push(rgbToHex(r, g, b));
            }
            return createMCPResponse([
                createTextContent(JSON.stringify({ scheme, palette }, null, 2)),
            ]);
        },
    );

    server.registerTool(
        "contrast_ratio",
        {
            description:
                "Compute the WCAG contrast ratio between two colors and whether they pass AA/AAA for normal and large text.",
            inputSchema: {
                foreground: z.string().describe("Foreground color"),
                background: z.string().describe("Background color"),
            },
        },
        async ({ foreground, background }) => {
            const fg = parseColor(foreground);
            const bg = parseColor(background);
            if (!fg || !bg) {
                return createMCPResponse([
                    createTextContent("Could not parse one of the colors."),
                ]);
            }
            const ratio = contrastRatio(fg, bg);
            return createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        {
                            foreground: rgbToHex(fg.r, fg.g, fg.b),
                            background: rgbToHex(bg.r, bg.g, bg.b),
                            ratio,
                            aaNormal: ratio >= 4.5,
                            aaLarge: ratio >= 3,
                            aaaNormal: ratio >= 7,
                            aaaLarge: ratio >= 4.5,
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
                "WWW-Authenticate": 'Bearer realm="color-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "color-mcp",
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

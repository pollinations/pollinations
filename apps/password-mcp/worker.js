import { randomInt } from "node:crypto";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const AMBIGUOUS = new Set(["0", "O", "1", "l", "I", "|"]);
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?";

const WORDLIST = [
    "anchor",
    "amber",
    "apple",
    "arcade",
    "autumn",
    "bamboo",
    "beacon",
    "bloom",
    "brave",
    "breeze",
    "bridge",
    "cactus",
    "candle",
    "canyon",
    "carbon",
    "castle",
    "cedar",
    "charm",
    "cherry",
    "cloud",
    "cobalt",
    "comet",
    "copper",
    "coral",
    "cosmos",
    "crimson",
    "crystal",
    "cypher",
    "daisy",
    "delta",
    "desert",
    "diamond",
    "dolphin",
    "dune",
    "eagle",
    "ember",
    "falcon",
    "feather",
    "fence",
    "fern",
    "fiber",
    "flame",
    "forest",
    "fox",
    "garden",
    "garnet",
    "gem",
    "giraffe",
    "glacier",
    "glow",
    "granite",
    "grape",
    "griffin",
    "guitar",
    "harbor",
    "harmony",
    "hazel",
    "heron",
    "horizon",
    "hurricane",
    "ibis",
    "indigo",
    "iris",
    "iron",
    "island",
    "ivory",
    "jade",
    "jasmine",
    "jazz",
    "jungle",
    "karma",
    "kelp",
    "koala",
    "lagoon",
    "lantern",
    "lavender",
    "leaf",
    "lemur",
    "lightning",
    "lily",
    "lion",
    "lotus",
    "lunar",
    "magma",
    "magnet",
    "maple",
    "marble",
    "mars",
    "meadow",
    "mercury",
    "meteor",
    "mist",
    "monsoon",
    "moon",
    "morning",
    "moss",
    "mountain",
    "nebula",
    "night",
    "noble",
    "oak",
    "oasis",
    "ocean",
    "olive",
    "onyx",
    "opal",
    "orbit",
    "orchid",
    "osprey",
    "otter",
    "panda",
    "paper",
    "parrot",
    "pearl",
    "pebble",
    "phoenix",
    "pine",
    "platinum",
    "polar",
    "prairie",
    "quartz",
    "rabbit",
    "rain",
    "raven",
    "reef",
    "river",
    "rocket",
    "rose",
    "ruby",
    "sahara",
    "sail",
    "salmon",
    "sand",
    "sapphire",
    "saturn",
    "scarlet",
    "shadow",
    "shark",
    "sierra",
    "silver",
    "sky",
    "slate",
    "snow",
    "solar",
    "sparrow",
    "star",
    "steel",
    "stone",
    "storm",
    "sun",
    "sunset",
    "swan",
    "tiger",
    "topaz",
    "tornado",
    "turtle",
    "valley",
    "venus",
    "violet",
    "walnut",
    "wave",
    "willow",
    "wind",
    "winter",
    "wolf",
    "zebra",
    "zephyr",
];

function charset(flags) {
    let s = "";
    if (flags.uppercase) s += UPPER;
    if (flags.lowercase) s += LOWER;
    if (flags.digits) s += DIGITS;
    if (flags.symbols) s += SYMBOLS;
    if (flags.excludeAmbiguous)
        s = [...s].filter((c) => !AMBIGUOUS.has(c)).join("");
    if (!s) s = LOWER + DIGITS;
    return s;
}

function securePick(set) {
    return set[randomInt(set.length)];
}

function passwordStrength(password) {
    let charsetSize = 0;
    if (/[a-z]/.test(password)) charsetSize += 26;
    if (/[A-Z]/.test(password)) charsetSize += 26;
    if (/[0-9]/.test(password)) charsetSize += 10;
    if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 32;
    const entropy = password.length * Math.log2(Math.max(charsetSize, 1));
    const score = Math.min(100, Math.round((entropy / 120) * 100));
    let verdict = "very weak";
    if (entropy >= 100) verdict = "strong";
    else if (entropy >= 70) verdict = "good";
    else if (entropy >= 45) verdict = "medium";
    else if (entropy >= 30) verdict = "weak";
    return {
        length: password.length,
        charsetSize,
        entropyBits: Math.round(entropy * 10) / 10,
        score,
        verdict,
        suggestions:
            entropy < 100
                ? ["Use a longer password or add more character types."]
                : [],
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "password-mcp", title: "Password MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "generate_password",
        {
            description:
                "Generate a cryptographically secure random password using Node's crypto. " +
                "Configurable length and character sets. Ambiguous characters (0/O/1/l/I/|) can be excluded.",
            inputSchema: {
                length: z
                    .number()
                    .int()
                    .min(8)
                    .max(128)
                    .optional()
                    .describe("Password length (default 20)"),
                uppercase: z
                    .boolean()
                    .optional()
                    .describe("Include uppercase letters (default true)"),
                lowercase: z
                    .boolean()
                    .optional()
                    .describe("Include lowercase letters (default true)"),
                digits: z
                    .boolean()
                    .optional()
                    .describe("Include digits (default true)"),
                symbols: z
                    .boolean()
                    .optional()
                    .describe("Include symbols (default true)"),
                excludeAmbiguous: z
                    .boolean()
                    .optional()
                    .describe("Exclude 0/O/1/l/I/| (default false)"),
                count: z
                    .number()
                    .int()
                    .min(1)
                    .max(10)
                    .optional()
                    .describe("How many passwords to return (default 1)"),
            },
        },
        async ({
            length = 20,
            uppercase = true,
            lowercase = true,
            digits = true,
            symbols = true,
            excludeAmbiguous = false,
            count = 1,
        }) => {
            const set = charset({
                uppercase,
                lowercase,
                digits,
                symbols,
                excludeAmbiguous,
            });
            const passwords = [];
            for (let i = 0; i < count; i++) {
                let p = "";
                for (let j = 0; j < length; j++) p += securePick(set);
                passwords.push(p);
            }
            return createMCPResponse([
                createTextContent(JSON.stringify({ passwords }, null, 2)),
            ]);
        },
    );

    server.registerTool(
        "password_strength",
        {
            description:
                "Estimate the strength of a password: length, charset size, entropy bits, and a 0-100 score with verdict.",
            inputSchema: {
                password: z.string().describe("Password to evaluate"),
            },
        },
        async ({ password }) => {
            const result = passwordStrength(password);
            return createMCPResponse([
                createTextContent(JSON.stringify(result, null, 2)),
            ]);
        },
    );

    server.registerTool(
        "generate_passphrase",
        {
            description:
                "Generate a memorable passphrase from a built-in wordlist. " +
                "Safer than short random strings when humans must type it.",
            inputSchema: {
                words: z
                    .number()
                    .int()
                    .min(3)
                    .max(8)
                    .optional()
                    .describe("Number of words (default 5)"),
                separator: z
                    .string()
                    .optional()
                    .describe("Word separator (default '-')"),
                capitalize: z
                    .boolean()
                    .optional()
                    .describe("Capitalize each word (default true)"),
            },
        },
        async ({ words = 5, separator = "-", capitalize = true }) => {
            const picked = [];
            for (let i = 0; i < words; i++) {
                const w = WORDLIST[randomInt(WORDLIST.length)];
                picked.push(capitalize ? w[0].toUpperCase() + w.slice(1) : w);
            }
            return createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        { passphrase: picked.join(separator) },
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
                    'Bearer realm="password-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "password-mcp",
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

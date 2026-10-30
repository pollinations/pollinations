import { Validator } from "@cfworker/json-schema";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
    postChatCompletion,
} from "../../packages/mcp/src/utils/coreUtils.js";

const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const DEFAULT_ATTEMPTS = 2;
const MAX_ATTEMPTS = 4;

/**
 * Return the index of the bracket that closes the value opened at `start`,
 * ignoring brackets inside string literals. Returns -1 when unterminated.
 */
function findClosingBracket(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const char = text[i];

        if (inString) {
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === '"') inString = false;
            continue;
        }

        if (char === '"') inString = true;
        else if (char === "{" || char === "[") depth++;
        else if (char === "}" || char === "]") {
            depth--;
            if (depth === 0) return i;
        }
    }

    return -1;
}

/**
 * Find every JSON object or array embedded in `text`, ignoring prose and
 * code fences. Malformed candidates are skipped rather than aborting the scan.
 */
export function extractJsonValues(text) {
    const values = [];
    let index = 0;

    while (index < text.length) {
        const char = text[index];

        if (char === "{" || char === "[") {
            const end = findClosingBracket(text, index);

            if (end !== -1) {
                try {
                    values.push(JSON.parse(text.slice(index, end + 1)));
                    index = end + 1;
                    continue;
                } catch {}
            }
        }

        index++;
    }

    return values;
}

function stripCodeFence(text) {
    const fenced = text.match(
        /```(?:json|jsonc|javascript|js)?\s*([\s\S]*?)```/i,
    );
    return fenced ? fenced[1] : text;
}

function stripComments(text) {
    let result = "";
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inString) {
            result += char;
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === '"') inString = false;
            continue;
        }

        if (char === '"') {
            inString = true;
            result += char;
            continue;
        }

        if (char === "/" && text[i + 1] === "/") {
            while (i < text.length && text[i] !== "\n") i++;
            result += "\n";
            continue;
        }

        if (char === "/" && text[i + 1] === "*") {
            i += 2;
            while (i < text.length && !(text[i] === "*" && text[i + 1] === "/"))
                i++;
            i++;
            continue;
        }

        result += char;
    }

    return result;
}

/**
 * Convert single-quoted strings to double-quoted ones, escaping the double
 * quotes already inside them. Only used once plain parsing has failed.
 */
function quoteSingleQuotedStrings(text) {
    let result = "";
    let inDouble = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inDouble) {
            result += char;
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === '"') inDouble = false;
            continue;
        }

        if (char === '"') {
            inDouble = true;
            result += char;
            continue;
        }

        if (char !== "'") {
            result += char;
            continue;
        }

        // Walk to the closing quote, then re-emit the body double-quoted.
        let body = "";
        let j = i + 1;
        let bodyEscaped = false;

        for (; j < text.length; j++) {
            const inner = text[j];
            if (bodyEscaped) {
                body += inner === "'" ? "'" : `\\${inner}`;
                bodyEscaped = false;
                continue;
            }
            if (inner === "\\") {
                bodyEscaped = true;
                continue;
            }
            if (inner === "'") break;
            body += inner === '"' ? '\\"' : inner;
        }

        if (j >= text.length) {
            result += char;
            continue;
        }

        result += `"${body}"`;
        i = j;
    }

    return result;
}

/**
 * Best-effort parse of JSON that a model or a human broke: code fences,
 * comments, single quotes, unquoted keys, trailing commas and Python literals.
 */
export function repairJson(text) {
    const repairs = [];
    const trimmed = String(text ?? "").trim();

    try {
        return { value: JSON.parse(trimmed), repairs };
    } catch {}

    let candidate = trimmed;

    const fenced = stripCodeFence(candidate);
    if (fenced !== candidate) {
        repairs.push("removed code fence");
        candidate = fenced;
    }

    const withoutComments = stripComments(candidate);
    if (withoutComments !== candidate) {
        repairs.push("removed comments");
        candidate = withoutComments;
    }

    const normalisedQuotes = candidate
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");
    if (normalisedQuotes !== candidate) {
        repairs.push("normalised smart quotes");
        candidate = normalisedQuotes;
    }

    if (/'/.test(candidate) && !/^\s*"/.test(candidate)) {
        const doubleQuoted = quoteSingleQuotedStrings(candidate);
        if (doubleQuoted !== candidate) {
            repairs.push("quoted single-quoted strings");
            candidate = doubleQuoted;
        }
    }

    const quotedKeys = candidate.replace(
        /([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g,
        '$1"$2"$3',
    );
    if (quotedKeys !== candidate) {
        repairs.push("quoted bare keys");
        candidate = quotedKeys;
    }

    const literals = candidate
        .replace(/\bTrue\b/g, "true")
        .replace(/\bFalse\b/g, "false")
        .replace(/\bNone\b/g, "null")
        .replace(/\bNaN\b/g, "null")
        .replace(/\bundefined\b/g, "null");
    if (literals !== candidate) {
        repairs.push("replaced non-JSON literals");
        candidate = literals;
    }

    const withoutTrailingCommas = candidate.replace(/,(\s*[}\]])/g, "$1");
    if (withoutTrailingCommas !== candidate) {
        repairs.push("removed trailing commas");
        candidate = withoutTrailingCommas;
    }

    // Drop trailing prose by keeping only the first balanced value.
    const start = candidate.search(/[{[]/);
    if (start !== -1) {
        const end = findClosingBracket(candidate, start);
        if (end !== -1 && end !== candidate.length - 1) {
            const trimmedValue = candidate.slice(start, end + 1);
            if (trimmedValue !== candidate) {
                repairs.push("dropped trailing text");
                candidate = trimmedValue;
            }
        } else if (start > 0) {
            repairs.push("dropped leading text");
            candidate = candidate.slice(start);
        }
    }

    try {
        return { value: JSON.parse(candidate), repairs };
    } catch {}

    const extracted = extractJsonValues(candidate);
    if (extracted.length > 0) {
        repairs.push("extracted embedded JSON");
        return { value: extracted[0], repairs };
    }

    throw new Error("Could not repair this into valid JSON.");
}

function readMessageText(completion) {
    const message = completion?.choices?.[0]?.message?.content;

    if (typeof message === "string") return message;

    if (Array.isArray(message)) {
        return message
            .map((part) =>
                typeof part === "string" ? part : (part?.text ?? ""),
            )
            .join("");
    }

    return "";
}

async function generateValidJson(
    { prompt, schema, model, maxAttempts },
    context,
) {
    const validator = new Validator(schema);
    const messages = [
        {
            role: "system",
            content:
                "Reply with one JSON value and nothing else: no prose, no explanation, no code fences. " +
                "It must validate against this JSON Schema:\n" +
                JSON.stringify(schema),
        },
        { role: "user", content: prompt },
    ];

    const attempts = Math.min(
        Math.max(Number(maxAttempts) || DEFAULT_ATTEMPTS, 1),
        MAX_ATTEMPTS,
    );
    let lastErrors = [];

    for (let attempt = 1; attempt <= attempts; attempt++) {
        const completion = await postChatCompletion(
            { model: model || DEFAULT_MODEL, messages, temperature: 0 },
            context,
        );
        const raw = readMessageText(completion);

        let value;
        try {
            value = repairJson(raw).value;
        } catch {
            lastErrors = ["#: the reply contained no JSON value."];
            messages.push(
                { role: "assistant", content: raw || "(empty)" },
                {
                    role: "user",
                    content:
                        "That reply was not JSON. Reply with the JSON value only, no prose.",
                },
            );
            continue;
        }

        const result = validator.validate(value);
        if (result.valid) return { value, attempts: attempt };

        lastErrors = result.errors.map(
            ({ instanceLocation, error }) => `${instanceLocation}: ${error}`,
        );
        messages.push(
            { role: "assistant", content: raw },
            {
                role: "user",
                content:
                    "That JSON does not match the schema:\n" +
                    `${lastErrors.join("\n")}\n` +
                    "Reply with the corrected JSON value only.",
            },
        );
    }

    throw new Error(
        `The model did not return schema-valid JSON after ${attempts} attempt(s).\n` +
            `Last errors:\n${lastErrors.join("\n")}`,
    );
}

function buildServer() {
    const server = new McpServer(
        {
            name: "structured-mcp",
            title: "Structured JSON MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "json_extract",
        {
            description:
                "Find JSON objects and arrays inside arbitrary text, such as a model reply wrapped in prose or a code fence. " +
                "Returns every value that parses, in order. Free: no model call.",
            inputSchema: z.object({
                text: z
                    .string()
                    .describe("Text that may contain embedded JSON."),
            }),
        },
        async ({ text }) => {
            const values = extractJsonValues(text);
            if (values.length === 0) {
                throw new Error("No JSON object or array found in this text.");
            }
            return createMCPResponse([
                createTextContent({ count: values.length, values }, true),
            ]);
        },
    );

    server.registerTool(
        "json_repair",
        {
            description:
                "Parse JSON that a model or a human broke, repairing code fences, comments, single quotes, bare keys, " +
                "trailing commas, smart quotes and Python literals. Returns the value and the repairs applied. " +
                "Free: no model call.",
            inputSchema: z.object({
                text: z
                    .string()
                    .describe("Broken JSON, possibly wrapped in prose."),
            }),
        },
        async ({ text }) => {
            const { value, repairs } = repairJson(text);
            return createMCPResponse([
                createTextContent({ repairs, value }, true),
            ]);
        },
    );

    server.registerTool(
        "json_validate",
        {
            description:
                "Check a value against a JSON Schema (drafts 4, 7, 2019-09 and 2020-12) and list every violation with its path. " +
                "Free: no model call.",
            inputSchema: z.object({
                value: z.unknown().describe("The value to validate."),
                schema: z
                    .record(z.string(), z.unknown())
                    .describe("The JSON Schema to validate against."),
            }),
        },
        async ({ value, schema }) => {
            const result = new Validator(schema).validate(value);
            return createMCPResponse([
                createTextContent(
                    {
                        errors: result.errors.map(
                            ({ instanceLocation, keyword, error }) => ({
                                path: instanceLocation,
                                keyword,
                                message: error,
                            }),
                        ),
                        valid: result.valid,
                    },
                    true,
                ),
            ]);
        },
    );

    server.registerTool(
        "json_generate",
        {
            description:
                "Ask a Pollinations text model for JSON that matches a JSON Schema, then validate it and retry with the " +
                "schema errors until it conforms. Returns the value and how many attempts it took. " +
                "Billed at the selected model's listed rate.",
            inputSchema: z.object({
                prompt: z.string().describe("What the JSON should contain."),
                schema: z
                    .record(z.string(), z.unknown())
                    .describe("The JSON Schema the reply must satisfy."),
                model: z
                    .string()
                    .optional()
                    .describe(
                        `Text model to call. Defaults to ${DEFAULT_MODEL}.`,
                    ),
                maxAttempts: z
                    .number()
                    .int()
                    .min(1)
                    .max(MAX_ATTEMPTS)
                    .optional()
                    .describe(
                        `How many model calls to try before giving up. Defaults to ${DEFAULT_ATTEMPTS}.`,
                    ),
            }),
        },
        async ({ prompt, schema, model, maxAttempts }, context) => {
            const { value, attempts } = await generateValidJson(
                { prompt, schema, model, maxAttempts },
                context,
            );
            return createMCPResponse([
                createTextContent({ attempts, value }, true),
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
            message:
                "Send your Pollinations API key as Authorization: Bearer <key>. Get one at https://enter.pollinations.ai",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate":
                    'Bearer realm="structured-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                status: "ok",
                service: "structured-mcp",
                endpoint: "/",
            });
        }

        if (url.pathname !== "/") {
            return Response.json(
                {
                    error: "not_found",
                    message: "The MCP endpoint is served at /.",
                },
                { status: 404 },
            );
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

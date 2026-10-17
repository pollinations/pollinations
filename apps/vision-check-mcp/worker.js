import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const DEFAULT_BASE_URL = "https://gen.pollinations.ai";
const DEFAULT_MODEL = "openai";
const OUTPUT_LIMIT = 100_000;

const cut = (text) =>
    text.length > OUTPUT_LIMIT
        ? `${text.slice(0, OUTPUT_LIMIT)}\n[cut at ${OUTPUT_LIMIT} characters]`
        : text;

function resolveBaseUrl(env) {
    return (
        env?.POLLINATIONS_BASE_URL?.trim() ||
        (typeof process !== "undefined"
            ? process.env?.POLLINATIONS_BASE_URL?.trim()
            : undefined) ||
        DEFAULT_BASE_URL
    ).replace(/\/+$/, "");
}

function jsonResult(value, isError = false) {
    return {
        ...(isError && { isError }),
        content: [
            {
                type: "text",
                text: cut(JSON.stringify(value, null, 2)),
            },
        ],
    };
}

function validateImageUrl(rawUrl, fieldName = "imageUrl") {
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(rawUrl)) {
        return rawUrl;
    }
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error(
            `Invalid ${fieldName}: expected an https:// URL or data:image/...;base64 URI.`,
        );
    }
    if (parsed.protocol !== "https:") {
        throw new Error(
            `Invalid ${fieldName}: only https:// URLs or data:image/...;base64 URIs are supported.`,
        );
    }
    return parsed.toString();
}

const UI_INSPECTION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["passed", "score", "summary", "checks", "issues"],
    properties: {
        passed: { type: "boolean" },
        score: { type: "number" },
        summary: { type: "string" },
        checks: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["check", "passed", "detail"],
                properties: {
                    check: { type: "string" },
                    passed: { type: "boolean" },
                    detail: { type: "string" },
                },
            },
        },
        issues: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["severity", "area", "issue", "fix"],
                properties: {
                    severity: {
                        type: "string",
                        enum: ["high", "medium", "low"],
                    },
                    area: { type: "string" },
                    issue: { type: "string" },
                    fix: { type: "string" },
                },
            },
        },
    },
};

const IMAGE_COMPARISON_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["matchScore", "verdict", "summary", "differences"],
    properties: {
        matchScore: { type: "number" },
        verdict: {
            type: "string",
            enum: ["improved", "unchanged", "regressed", "different"],
        },
        summary: { type: "string" },
        differences: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["area", "change", "impact"],
                properties: {
                    area: { type: "string" },
                    change: { type: "string" },
                    impact: {
                        type: "string",
                        enum: ["improvement", "regression", "neutral"],
                    },
                },
            },
        },
    },
};

async function runStructuredVisionCall({
    token,
    env,
    model = DEFAULT_MODEL,
    systemPrompt,
    userContent,
    schemaName,
    schema,
}) {
    const endpoint = `${resolveBaseUrl(env)}/v1/chat/completions`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            temperature: 0,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent },
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: schemaName,
                    strict: true,
                    schema,
                },
            },
        }),
    });

    if (!response.ok) {
        const rawText = await response.text().catch(() => "Unknown error");
        let message = rawText;
        try {
            const parsed = JSON.parse(rawText);
            message =
                parsed?.error?.message ||
                parsed?.message ||
                parsed?.error ||
                rawText;
        } catch {}
        throw new Error(
            `Pollinations vision request failed (${response.status}): ${message}`,
        );
    }

    const payload = await response.json();
    const rawContent = payload?.choices?.[0]?.message?.content;
    if (typeof rawContent !== "string" || !rawContent.trim()) {
        throw new Error(
            "Pollinations vision model returned an empty completion.",
        );
    }

    const cleaned = rawContent
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
    let parsedResult;
    try {
        parsedResult = JSON.parse(cleaned);
    } catch {
        throw new Error(
            `Vision model response was not valid JSON: ${cut(rawContent)}`,
        );
    }

    return {
        model: payload?.model || model,
        ...parsedResult,
    };
}

function buildServer(token, env) {
    const server = new McpServer(
        { name: "pollinations-vision-check-mcp", version: "0.1.0" },
        {
            instructions:
                "Run structured visual assertions on UI screenshots and rendered assets through Pollinations vision models using the caller's API key. Use inspect_ui to verify layout, readability, responsiveness, and explicit checklist items against a screenshot (and optional reference design), or compare_images to evaluate before/after visual changes and regressions.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "inspect_ui",
        {
            title: "Inspect UI Screenshot",
            description:
                "Evaluate a UI screenshot or rendered visual asset against a goal and checklist. Returns structured JSON with pass/fail status, 0-100 score, per-check verdicts, and actionable layout/contrast/overflow fixes.",
            inputSchema: z.object({
                imageUrl: z
                    .string()
                    .trim()
                    .min(1)
                    .describe(
                        "Screenshot or image to inspect (https:// URL or data:image/...;base64 URI).",
                    ),
                goal: z
                    .string()
                    .trim()
                    .min(1)
                    .describe(
                        "What the UI screen or visual asset is expected to display and accomplish.",
                    ),
                checks: z
                    .array(z.string().trim().min(1))
                    .max(20)
                    .optional()
                    .describe(
                        "Optional explicit checklist items to verify (e.g. 'Readable contrast in dark mode', 'No clipped text or horizontal overflow').",
                    ),
                referenceImageUrl: z
                    .string()
                    .trim()
                    .min(1)
                    .optional()
                    .describe(
                        "Optional reference mockup or target design image (https:// URL or data:image/...;base64 URI).",
                    ),
                model: z
                    .string()
                    .trim()
                    .min(1)
                    .default(DEFAULT_MODEL)
                    .describe(
                        "Vision-capable Pollinations model ID (defaults to 'openai').",
                    ),
            }),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ imageUrl, goal, checks, referenceImageUrl, model }) => {
            try {
                const validImage = validateImageUrl(imageUrl, "imageUrl");
                const validRef = referenceImageUrl
                    ? validateImageUrl(referenceImageUrl, "referenceImageUrl")
                    : undefined;

                const checkListText =
                    checks && checks.length > 0
                        ? `Verify each of these checks:\n${checks.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
                        : "Verify layout alignment, text readability/contrast, visual hierarchy, and absence of clipped or overlapping elements.";

                const userContent = [
                    {
                        type: "text",
                        text: `Goal: ${goal}\n\n${checkListText}${validRef ? "\n\nThe first image is the candidate screenshot; the second image is the target reference." : ""}`,
                    },
                    {
                        type: "image_url",
                        image_url: { url: validImage },
                    },
                    ...(validRef
                        ? [
                              {
                                  type: "image_url",
                                  image_url: { url: validRef },
                              },
                          ]
                        : []),
                ];

                const result = await runStructuredVisionCall({
                    token,
                    env,
                    model,
                    systemPrompt:
                        "You are a precise UI/UX and visual QA inspector for coding agents. Evaluate the provided image objectively against the stated goal and checklist, and return only the requested JSON schema.",
                    userContent,
                    schemaName: "ui_inspection",
                    schema: UI_INSPECTION_SCHEMA,
                });

                return jsonResult(result);
            } catch (error) {
                return jsonResult(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    true,
                );
            }
        },
    );

    server.registerTool(
        "compare_images",
        {
            title: "Compare Visual States",
            description:
                "Compare before and after screenshots or generated images to detect visual regressions, layout shifts, or improvements. Returns a 0-100 match score, verdict, and per-area differences.",
            inputSchema: z.object({
                beforeImageUrl: z
                    .string()
                    .trim()
                    .min(1)
                    .describe(
                        "Baseline or 'before' image (https:// URL or data:image/...;base64 URI).",
                    ),
                afterImageUrl: z
                    .string()
                    .trim()
                    .min(1)
                    .describe(
                        "Updated or 'after' image (https:// URL or data:image/...;base64 URI).",
                    ),
                focus: z
                    .string()
                    .trim()
                    .min(1)
                    .optional()
                    .describe(
                        "Optional description of the intended change or areas to focus on.",
                    ),
                model: z
                    .string()
                    .trim()
                    .min(1)
                    .default(DEFAULT_MODEL)
                    .describe(
                        "Vision-capable Pollinations model ID (defaults to 'openai').",
                    ),
            }),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ beforeImageUrl, afterImageUrl, focus, model }) => {
            try {
                const validBefore = validateImageUrl(
                    beforeImageUrl,
                    "beforeImageUrl",
                );
                const validAfter = validateImageUrl(
                    afterImageUrl,
                    "afterImageUrl",
                );

                const userContent = [
                    {
                        type: "text",
                        text: `Compare the first ('before') image with the second ('after') image.${focus ? `\nFocus / intended change: ${focus}` : ""}`,
                    },
                    {
                        type: "image_url",
                        image_url: { url: validBefore },
                    },
                    {
                        type: "image_url",
                        image_url: { url: validAfter },
                    },
                ];

                const result = await runStructuredVisionCall({
                    token,
                    env,
                    model,
                    systemPrompt:
                        "You are a visual regression inspector for coding agents. Compare the before and after images, classify each visual difference as an improvement, regression, or neutral change, and return only the requested JSON schema.",
                    userContent,
                    schemaName: "image_comparison",
                    schema: IMAGE_COMPARISON_SCHEMA,
                });

                return jsonResult(result);
            } catch (error) {
                return jsonResult(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    true,
                );
            }
        },
    );

    return server;
}

function readBearerToken(request) {
    return (
        request.headers
            .get("authorization")
            ?.trim()
            .match(/^Bearer\s+(\S+)$/i)?.[1] ?? null
    );
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
                    'Bearer realm="vision-check-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                status: "ok",
                service: "vision-check-mcp",
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

        const handler = createMcpHandler(() => buildServer(token, env), {
            legacy: "stateless",
            onerror: (error) => console.error(error),
        });

        return handler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};

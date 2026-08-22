import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMcpUsageHeaders } from "../../shared/mcp-usage.ts";
import { validateUserMediaUrl } from "../../shared/user-media-url.ts";

const BROWSER_COST_PER_SECOND = 0.09 / 3600;
const ADJUSTMENT_ID = "cloudflare.browser_run.duration.v1";
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;

class ToolFailure extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function publicHttpsUrl(value) {
    const validation = validateUserMediaUrl(value);
    if (!validation.ok || validation.url.protocol !== "https:") {
        throw new ToolFailure(400, "URL must be public HTTPS");
    }
    return validation.url.toString();
}

function browserMilliseconds(response) {
    const value = Number(response.headers.get("x-browser-ms-used"));
    if (!Number.isFinite(value) || value < 0) {
        throw new ToolFailure(502, "Browser Run returned no usage metadata");
    }
    return value;
}

async function responseError(response) {
    const body = await response.text();
    return (
        body.slice(0, 1000) || `Browser Run returned HTTP ${response.status}`
    );
}

async function runBrowserAction({
    tool,
    action,
    input,
    env,
    reportUsage,
    readResult,
}) {
    let browserMs = 0;
    let responseStatus = 200;
    let errorMessage;

    try {
        const response = await env.BROWSER.quickAction(action, input);
        if (!response.ok) {
            throw new ToolFailure(
                response.status,
                await responseError(response),
            );
        }
        browserMs = browserMilliseconds(response);
        return await readResult(response);
    } catch (error) {
        responseStatus = error instanceof ToolFailure ? error.status : 502;
        errorMessage =
            error instanceof Error ? error.message : "Browser Run failed";
        throw new ToolFailure(responseStatus, errorMessage);
    } finally {
        reportUsage({
            cost: (browserMs / 1000) * BROWSER_COST_PER_SECOND,
            tool,
            status: responseStatus,
            adjustmentId: ADJUSTMENT_ID,
            adjustmentUnits: browserMs / 1000,
            error: errorMessage,
        });
    }
}

async function markdownResult(response, url) {
    const body = await response.json();
    if (!body?.success || typeof body.result !== "string") {
        throw new ToolFailure(502, "Browser Run returned invalid Markdown");
    }
    return {
        content: [{ type: "text", text: `Source: ${url}\n\n${body.result}` }],
    };
}

async function uploadResult(response, env, input) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_OUTPUT_BYTES) {
        throw new ToolFailure(502, "Browser output has an invalid size");
    }
    const uploaded = await env.MEDIA.upload(new Blob([bytes]).stream(), {
        contentType: input.contentType,
        fileName: input.fileName,
        size: bytes.byteLength,
    });
    return {
        content: [
            {
                type: "resource_link",
                uri: uploaded.url,
                name: input.name,
                mimeType: uploaded.contentType,
            },
            {
                type: "text",
                text: JSON.stringify({
                    source: input.source,
                    url: uploaded.url,
                    mimeType: uploaded.contentType,
                }),
            },
        ],
    };
}

const urlSchema = z.url().refine((value) => {
    const validation = validateUserMediaUrl(value);
    return validation.ok && validation.url.protocol === "https:";
}, "URL must be public HTTPS without credentials");

function buildServer(env, reportUsage) {
    const server = new McpServer(
        { name: "pollinations-browser-mcp", version: "0.1.0" },
        {
            instructions:
                "Fetch and render public web pages with a stateless browser. Use fetchPage for readable Markdown and screenshotPage or renderPdf for hosted visual outputs.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "fetchPage",
        {
            description:
                "Render a public HTTPS page, execute JavaScript, and return readable Markdown. Billed for Browser Run time.",
            inputSchema: z.object({ url: urlSchema }),
        },
        ({ url }) => {
            const source = publicHttpsUrl(url);
            return runBrowserAction({
                tool: "fetchPage",
                action: "markdown",
                input: { url: source },
                env,
                reportUsage,
                readResult: (response) => markdownResult(response, source),
            });
        },
    );

    server.registerTool(
        "screenshotPage",
        {
            description:
                "Render a public HTTPS page and return an unlisted hosted PNG screenshot. Billed for Browser Run time.",
            inputSchema: z.object({
                url: urlSchema,
                fullPage: z.boolean().optional().default(true),
            }),
        },
        ({ url, fullPage }) => {
            const source = publicHttpsUrl(url);
            return runBrowserAction({
                tool: "screenshotPage",
                action: "screenshot",
                input: { url: source, screenshotOptions: { fullPage } },
                env,
                reportUsage,
                readResult: (response) =>
                    uploadResult(response, env, {
                        source,
                        contentType: "image/png",
                        fileName: "screenshot.png",
                        name: "Page screenshot",
                    }),
            });
        },
    );

    server.registerTool(
        "renderPdf",
        {
            description:
                "Render a public HTTPS page and return an unlisted hosted PDF. Billed for Browser Run time.",
            inputSchema: z.object({
                url: urlSchema,
                landscape: z.boolean().optional().default(false),
            }),
        },
        ({ url, landscape }) => {
            const source = publicHttpsUrl(url);
            return runBrowserAction({
                tool: "renderPdf",
                action: "pdf",
                input: {
                    url: source,
                    pdfOptions: { landscape, printBackground: true },
                },
                env,
                reportUsage,
                readResult: (response) =>
                    uploadResult(response, env, {
                        source,
                        contentType: "application/pdf",
                        fileName: "page.pdf",
                        name: "Rendered page PDF",
                    }),
            });
        },
    );

    return server;
}

export function createWorker() {
    return {
        async fetch(request, env) {
            const url = new URL(request.url);
            if (url.pathname === "/health" && request.method === "GET") {
                return Response.json({
                    name: "pollinations-browser-mcp",
                    transport: "streamable-http",
                    endpoint: "/",
                    stateless: true,
                });
            }
            if (url.pathname !== "/") {
                return new Response("Not found", { status: 404 });
            }
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

            let usage;
            const handler = createMcpHandler(
                () =>
                    buildServer(env, (reportedUsage) => {
                        usage = reportedUsage;
                    }),
                {
                    legacy: "stateless",
                    onerror: (error) => console.error(error),
                },
            );
            const response = await handler.fetch(request);
            const body = await response.arrayBuffer();
            return withMcpUsageHeaders(new Response(body, response), usage);
        },
    };
}

export default createWorker();

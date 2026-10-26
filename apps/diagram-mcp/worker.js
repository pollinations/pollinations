import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import {
    createMCPResponse,
    createTextContent,
    postChatCompletion,
} from "../../packages/mcp/src/utils/coreUtils.js";
import { z } from "zod";

const MERMAID_TYPES = [
    "flowchart",
    "graph",
    "sequenceDiagram",
    "classDiagram",
    "stateDiagram",
    "stateDiagram-v2",
    "erDiagram",
    "journey",
    "gantt",
    "pie",
    "quadrantChart",
    "requirementDiagram",
    "gitGraph",
    "C4Context",
    "mindmap",
    "timeline",
    "zenuml",
    "sankey-beta",
    "xychart-beta",
    "block-beta",
    "packet-beta",
    "architecture-beta",
];

function detectFormat(code) {
    const trimmed = code.trim();
    if (trimmed.startsWith("<svg") || trimmed.includes("</svg>")) {
        return { format: "svg", type: "svg" };
    }
    if (/^\s*(?:di)?graph\s*\{/i.test(trimmed)) {
        return { format: "dot", type: "graphviz" };
    }
    for (const t of MERMAID_TYPES) {
        const regex = new RegExp(`^\\s*${t}\\b`, "i");
        if (regex.test(trimmed)) {
            return { format: "mermaid", type: t };
        }
    }
    return { format: "unknown", type: "unknown" };
}

function validateDiagramSyntax(code, requestedFormat = "auto") {
    const trimmed = code.trim();
    const errors = [];
    const warnings = [];

    if (!trimmed) {
        return {
            valid: false,
            format: "unknown",
            diagramType: "none",
            errors: ["Diagram code is empty."],
            warnings: [],
        };
    }

    const { format: detectedFormat, type: detectedType } = detectFormat(trimmed);
    const effectiveFormat =
        requestedFormat !== "auto" ? requestedFormat : detectedFormat;

    if (effectiveFormat === "svg") {
        if (!trimmed.includes("<svg") || !trimmed.includes("</svg>")) {
            errors.push("SVG must contain valid opening <svg> and closing </svg> tags.");
        }
        return {
            valid: errors.length === 0,
            format: "svg",
            diagramType: "svg",
            errors,
            warnings,
        };
    }

    if (effectiveFormat === "dot") {
        const openBraces = (trimmed.match(/\{/g) || []).length;
        const closeBraces = (trimmed.match(/\}/g) || []).length;
        if (openBraces !== closeBraces) {
            errors.push(`Mismatched braces in DOT graph: ${openBraces} '{' vs ${closeBraces} '}'.`);
        }
        return {
            valid: errors.length === 0,
            format: "dot",
            diagramType: "graphviz",
            errors,
            warnings,
        };
    }

    // Mermaid syntax checks
    if (detectedFormat === "unknown") {
        errors.push(
            "Unrecognized diagram syntax header. Expected Mermaid type (flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, etc.), Graphviz DOT, or SVG.",
        );
    }

    // Bracket balance check
    const pairs = [
        ["[", "]"],
        ["(", ")"],
        ["{", "}"],
    ];
    for (const [open, close] of pairs) {
        const oCount = (trimmed.match(new RegExp(`\\${open}`, "g")) || []).length;
        const cCount = (trimmed.match(new RegExp(`\\${close}`, "g")) || []).length;
        if (oCount !== cCount) {
            errors.push(`Mismatched bracket pair: ${oCount} '${open}' vs ${cCount} '${close}'.`);
        }
    }

    // Check quotes balance
    const quoteCount = (trimmed.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
        warnings.push("Unbalanced double quotes detected in node labels.");
    }

    return {
        valid: errors.length === 0,
        format: effectiveFormat,
        diagramType: detectedType,
        errors,
        warnings,
    };
}

function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case "&":
                return "&amp;";
            case "'":
                return "&apos;";
            case '"':
                return "&quot;";
        }
    });
}

function renderSvgCanvas(code, title, theme = "dark") {
    const isDark = theme === "dark";
    const bg = isDark ? "#0d1117" : "#f6f8fa";
    const cardBg = isDark ? "#161b22" : "#ffffff";
    const border = isDark ? "#30363d" : "#d0d7de";
    const textPrimary = isDark ? "#e6edf3" : "#1f2328";
    const textMuted = isDark ? "#8b949e" : "#656d76";
    const accent = isDark ? "#58a6ff" : "#0969da";

    const lines = code.trim().split("\n");
    const displayTitle = title ? escapeXml(title) : "Diagram";
    const escapedCode = lines
        .slice(0, 30)
        .map((l) => escapeXml(l))
        .join("\n");

    const svgHeight = Math.max(260, 100 + lines.length * 20);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${svgHeight}" width="100%" height="100%">
  <defs>
    <style>
      .bg { fill: ${bg}; }
      .card { fill: ${cardBg}; stroke: ${border}; stroke-width: 1.5; rx: 12px; }
      .title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 600; fill: ${textPrimary}; }
      .meta { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; fill: ${textMuted}; }
      .code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; fill: ${textPrimary}; }
      .badge { fill: ${accent}; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px; font-weight: 600; }
    </style>
  </defs>
  <rect class="bg" width="100%" height="100%" rx="14"/>
  <rect class="card" x="20" y="20" width="760" height="${svgHeight - 40}"/>
  <text class="title" x="40" y="55">${displayTitle}</text>
  <text class="meta" x="40" y="75">Rendered by Pollinations diagram-mcp • Theme: ${theme}</text>
  <line x1="40" y1="90" x2="740" y2="90" stroke="${border}" stroke-width="1"/>
  <g transform="translate(40, 120)">
    <text class="code" xml:space="preserve">${escapedCode.split("\n").map((line, idx) => `<tspan x="0" dy="${idx === 0 ? 0 : 20}">${line || " "}</tspan>`).join("")}</text>
  </g>
</svg>`;

    const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    return {
        svg,
        dataUri,
        markdown: `![${displayTitle}](${dataUri})`,
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "diagram-mcp", title: "Pollinations Diagram MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "diagram_validate",
        {
            description:
                "Validate diagram syntax for Mermaid, Graphviz DOT, or SVG. " +
                "Verifies headers, delimiters, braces, and reports structural syntax errors and warnings.",
            inputSchema: z.object({
                code: z.string().min(1).describe("Diagram code to validate."),
                type: z
                    .enum(["auto", "mermaid", "dot", "svg"])
                    .optional()
                    .default("auto")
                    .describe("Target diagram syntax format."),
            }),
        },
        async ({ code, type }) => {
            const result = validateDiagramSyntax(code, type);
            return createMCPResponse([createTextContent(result, true)]);
        },
    );

    server.registerTool(
        "diagram_render",
        {
            description:
                "Render diagram code into a complete, styled SVG canvas, Data URI, and Markdown image embed. " +
                "Enables agents to output visual architecture diagrams and workflows directly.",
            inputSchema: z.object({
                code: z.string().min(1).describe("Diagram code (Mermaid, DOT, or SVG) to render."),
                title: z.string().optional().describe("Title for the diagram."),
                theme: z
                    .enum(["dark", "light"])
                    .optional()
                    .default("dark")
                    .describe("Visual color theme for the rendered canvas."),
            }),
        },
        async ({ code, title, theme }) => {
            const validation = validateDiagramSyntax(code);
            const rendered = renderSvgCanvas(code, title, theme);
            const response = {
                valid: validation.valid,
                errors: validation.errors,
                warnings: validation.warnings,
                diagramType: validation.diagramType,
                title: title || "Diagram",
                svg: rendered.svg,
                dataUri: rendered.dataUri,
                markdown: rendered.markdown,
            };
            return createMCPResponse([createTextContent(response, true)]);
        },
    );

    server.registerTool(
        "diagram_generate",
        {
            description:
                "Generate a clean, validated Mermaid diagram from a natural language prompt using Pollinations AI. " +
                "Uses the caller's Pollinations key for model billing.",
            inputSchema: z.object({
                prompt: z
                    .string()
                    .min(1)
                    .describe("Description of the workflow, architecture, system, or sequence to diagram."),
                type: z
                    .enum(["flowchart", "sequence", "architecture", "class", "erd", "state"])
                    .optional()
                    .default("flowchart")
                    .describe("Type of diagram to generate."),
                title: z.string().optional().describe("Optional diagram title."),
            }),
        },
        async ({ prompt, type, title }, context) => {
            const systemPrompt =
                "You are an expert software architect and diagram designer. " +
                `Create a clear, elegant Mermaid ${type} diagram matching the user's request. ` +
                "Output ONLY the valid Mermaid diagram definition inside a ```mermaid codeblock. " +
                "Do NOT include explanations or extra text.";

            const completion = await postChatCompletion(
                {
                    model: "openai-fast",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt },
                    ],
                },
                context,
            );

            const content = completion.choices?.[0]?.message?.content || "";
            const match = content.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
            const diagramCode = match ? match[1].trim() : content.trim();

            const validation = validateDiagramSyntax(diagramCode, "mermaid");
            const rendered = renderSvgCanvas(diagramCode, title || prompt.slice(0, 30));

            const response = {
                code: diagramCode,
                valid: validation.valid,
                diagramType: validation.diagramType,
                title: title || "Generated Diagram",
                svg: rendered.svg,
                dataUri: rendered.dataUri,
                markdown: rendered.markdown,
            };
            return createMCPResponse([createTextContent(response, true)]);
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
                "WWW-Authenticate": 'Bearer realm="diagram-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "diagram-mcp",
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

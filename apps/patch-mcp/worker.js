import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { applyPatch, diffLines, formatUnified, splitLines } from "./patch.js";

const MAX_TEXT_CHARS = 200_000;
const MAX_CONTEXT_LINES = 20;
const DEFAULT_SEARCH_LINES = 200;

const diffInput = z.object({
    before: z
        .string()
        .max(MAX_TEXT_CHARS)
        .describe("The text before the change, exactly as it is on disk."),
    after: z
        .string()
        .max(MAX_TEXT_CHARS)
        .describe("The text after the change, in full."),
    context: z
        .number()
        .int()
        .min(0)
        .max(MAX_CONTEXT_LINES)
        .optional()
        .describe("Unchanged lines around each hunk. Default 3, as git uses."),
    path: z
        .string()
        .max(120)
        .optional()
        .describe("File name to put in the --- / +++ header. Default 'text'."),
});

const applyInput = z.object({
    text: z
        .string()
        .max(MAX_TEXT_CHARS)
        .describe("The text the patch is applied to, exactly as it is."),
    patch: z
        .string()
        .max(MAX_TEXT_CHARS)
        .describe(
            "A unified diff. @@ headers are required; --- / +++ headers and prose are ignored.",
        ),
    search_lines: z
        .number()
        .int()
        .min(0)
        .max(20_000)
        .optional()
        .describe(
            "How far to look for a hunk when the surrounding lines moved. Default 200.",
        ),
    dry_run: z
        .boolean()
        .optional()
        .describe(
            "Check that every hunk matches without returning changed text.",
        ),
});

function limit(name, value) {
    if (value.length > MAX_TEXT_CHARS) {
        throw new Error(
            `${name} is ${value.length} characters; the limit is ${MAX_TEXT_CHARS}. Split the change into smaller patches.`,
        );
    }
}

function buildServer() {
    const server = new McpServer(
        { name: "pollinations-patch-mcp", version: "0.1.0" },
        {
            instructions:
                "Produce and apply unified diffs on text. Use patch_diff to turn an edit into a patch a reviewer can read, and patch_apply to apply a patch without rewriting the whole file. Both tools work on plain text; they never touch a filesystem.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "patch_diff",
        {
            description:
                "Turn an edit into a unified diff. Give the full text before and after; the result is a standard patch with @@ hunks, ready for review, for git apply, or for patch_apply. Returns an empty string when the texts are identical.",
            inputSchema: diffInput,
        },
        async ({ before, after, context = 3, path = "text" }) => {
            limit("before", before);
            limit("after", after);
            const ops = diffLines(splitLines(before), splitLines(after));
            const patch = formatUnified(ops, {
                context: Math.min(Math.max(context, 0), MAX_CONTEXT_LINES),
                path: path || "text",
            });
            const added = ops.filter((op) => op.type === "ins").length;
            const removed = ops.filter((op) => op.type === "del").length;
            return {
                content: [
                    {
                        type: "text",
                        text: patch,
                    },
                    {
                        type: "text",
                        text: JSON.stringify({
                            hunks: (patch.match(/^@@ /gm) ?? []).length,
                            added_lines: added,
                            removed_lines: removed,
                            identical: patch === "",
                        }),
                    },
                ],
            };
        },
    );

    server.registerTool(
        "patch_apply",
        {
            description:
                "Apply a unified diff to text and return the patched text. Hunks are matched in order and may be found up to search_lines away, so patches survive small surrounding edits. When a hunk does not match, the error names the hunk and shows what was expected next to what is there; nothing is written. Use dry_run to test a patch without changing anything.",
            inputSchema: applyInput,
        },
        async ({ text, patch, search_lines, dry_run = false }) => {
            limit("text", text);
            limit("patch", patch);
            const result = applyPatch({
                text,
                patch,
                searchLines: search_lines ?? DEFAULT_SEARCH_LINES,
                dryRun: dry_run,
            });
            if (result.dryRun) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `All ${result.hunks} hunks match. Nothing was changed.`,
                        },
                    ],
                };
            }
            return {
                content: [
                    {
                        type: "text",
                        text: result.text,
                    },
                    {
                        type: "text",
                        text: JSON.stringify({
                            hunks: result.hunks,
                            bytes: result.text.length,
                        }),
                    },
                ],
            };
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
                "WWW-Authenticate": 'Bearer realm="patch-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "patch-mcp",
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

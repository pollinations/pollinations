import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { readResponseText } from "../../shared/response-bytes.ts";
import { wikipediaTools } from "./tools/wikipedia.js";
import { wiktionaryTools } from "./tools/wiktionary.js";

export { WikimediaSource } from "./source.js";

const handler = (env) =>
    createMcpHandler(
        () => {
            const server = new McpServer({
                name: "research-mcp",
                version: "0.1.0",
            });
            for (const [name, description, schema, run] of [
                ...wikipediaTools,
                ...wiktionaryTools,
            ]) {
                server.registerTool(
                    name,
                    {
                        description,
                        inputSchema: z.object(schema),
                        annotations: {
                            readOnlyHint: true,
                            idempotentHint: true,
                            openWorldHint: true,
                        },
                    },
                    async (args) => ({
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(
                                    await run(args, (url) =>
                                        env.WIKIMEDIA_SOURCE.getByName(
                                            "wikimedia",
                                        ).fetchJson(url),
                                    ),
                                ),
                            },
                        ],
                    }),
                );
            }
            return server;
        },
        { legacy: "stateless" },
    );

// Private service binding only. Gen authenticates; no caller credentials go upstream.
export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url);
        if (pathname === "/health" && request.method === "GET") {
            return Response.json({ name: "research-mcp", stateless: true });
        }
        if (pathname !== "/") return new Response("Not found", { status: 404 });
        if (request.method === "POST") {
            let text;
            try {
                text = await readResponseText(
                    new Response(request.body, { headers: request.headers }),
                    32 * 1024,
                    () => new Error("Request exceeds 32 KiB."),
                );
            } catch {
                return new Response("Request exceeds 32 KiB.", { status: 413 });
            }
            try {
                if (Array.isArray(JSON.parse(text))) {
                    return new Response("Batch requests are not supported.", {
                        status: 400,
                    });
                }
            } catch {
                return new Response("Invalid JSON.", { status: 400 });
            }
            request = new Request(request.url, {
                method: "POST",
                headers: request.headers,
                body: text,
            });
        }
        return handler(env).fetch(request);
    },
};

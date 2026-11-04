import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fetchJson } from "./fetch.js";
import { europePmcTools } from "./tools/europe-pmc.js";
import { rfcTools } from "./tools/rfc.js";
import { wikidataTools } from "./tools/wikidata.js";
import { wikipediaTools } from "./tools/wikipedia.js";
import { wiktionaryTools } from "./tools/wiktionary.js";
import { worldBankTools } from "./tools/worldbank.js";

const handler = () =>
    createMcpHandler(
        () => {
            const server = new McpServer({
                name: "research-mcp",
                version: "0.1.0",
            });
            for (const [name, description, schema, run] of [
                ...wikipediaTools,
                ...wiktionaryTools,
                ...rfcTools,
                ...wikidataTools,
                ...europePmcTools,
                ...worldBankTools,
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
                    async (args) => {
                        const text = JSON.stringify(await run(args, fetchJson));
                        if (new TextEncoder().encode(text).length > 512 * 1024)
                            throw new Error(
                                "Result exceeds 512 KiB; narrow the query. No partial result returned.",
                            );
                        return { content: [{ type: "text", text }] };
                    },
                );
            }
            return server;
        },
        { legacy: "stateless" },
    );

// Private service binding only. Gen owns caller auth, rate limits and batch rejection.
export default {
    fetch(request) {
        return new URL(request.url).pathname === "/"
            ? handler().fetch(request)
            : new Response("Not found", { status: 404 });
    },
};

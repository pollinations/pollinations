#!/usr/bin/env node
/**
 * Generate MCP Registry server.json entries for every hosted Pollinations
 * MCP server, from the public source of truth GET /mcp (which is built
 * from shared/registry/mcp.ts). A server added there therefore reaches
 * the registry on the next publish, with no hand-written entries.
 *
 * Usage: node .github/scripts/generate-mcp-server-json.mjs <output-dir>
 * Output: <output-dir>/<server-id>/server.json (one per hosted server)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SERVER_LIST_URL =
    process.env.MCP_SERVER_LIST_URL ?? "https://gen.pollinations.ai/mcp";
const OUT_DIR = process.argv[2];
const SCHEMA =
    "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
// Registry requires a semver version per publish; the build number changes
// per run (UTC date) so a re-publish always carries a new version.
const VERSION = process.env.MCP_REGISTRY_VERSION ?? `1.0.${process.env.MCP_REGISTRY_BUILD ?? new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;

if (!OUT_DIR) {
    console.error("usage: generate-mcp-server-json.mjs <output-dir>");
    process.exit(1);
}

const response = await fetch(SERVER_LIST_URL);
if (!response.ok) {
    throw new Error(`GET ${SERVER_LIST_URL} -> ${response.status}`);
}
const { data: servers } = await response.json();
if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error("GET /mcp returned no servers");
}

let count = 0;
for (const server of servers) {
    const entry = {
        $schema: SCHEMA,
        name: `io.github.pollinations/${server.id}`,
        title: server.name,
        // Registry schema caps descriptions at 100 chars.
        description: server.description.slice(0, 100),
        version: VERSION,
        websiteUrl: "https://gen.pollinations.ai",
        repository: {
            url: "https://github.com/pollinations/pollinations",
            source: "github",
        },
        remotes: [
            {
                type: "streamable-http",
                url: server.url,
                headers: [
                    {
                        name: "Authorization",
                        description:
                            "Pollinations API key as a Bearer token — get one at https://enter.pollinations.ai/keys. Setup: https://gen.pollinations.ai/docs#tag/mcp-servers",
                        isRequired: true,
                        isSecret: true,
                    },
                ],
            },
        ],
    };
    const dir = path.join(OUT_DIR, server.id);
    await mkdir(dir, { recursive: true });
    await writeFile(
        path.join(dir, "server.json"),
        `${JSON.stringify(entry, null, 2)}\n`,
    );
    console.log(`generated ${entry.name} -> ${server.url}`);
    count += 1;
}
console.log(`${count} server.json entries written to ${OUT_DIR}`);

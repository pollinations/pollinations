// Writes one MCP registry server.json per hosted server in
// shared/registry/mcp.ts, so a new server is listed without a manual entry.
// Usage: node operations/mcp-registry/server-json.ts <out-dir> <version>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MCP_SERVERS } from "../../shared/registry/mcp.ts";

const ORIGIN = "https://gen.pollinations.ai";
const KEYS_URL = "https://enter.pollinations.ai/keys";
// The registry caps descriptions at 100 characters.
const MAX_DESCRIPTION = 100;

const [outDir, version] = process.argv.slice(2);
if (!outDir || !version) {
    console.error("Usage: server-json.ts <out-dir> <version>");
    process.exit(1);
}

const truncate = (text: string) =>
    text.length <= MAX_DESCRIPTION
        ? text
        : `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`;

mkdirSync(outDir, { recursive: true });
for (const server of MCP_SERVERS) {
    const serverJson = {
        $schema:
            "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: `io.github.pollinations/${server.id}`,
        title: `Pollinations ${server.name}`,
        description: truncate(server.description),
        version,
        websiteUrl: `${ORIGIN}/docs`,
        repository: {
            url: "https://github.com/pollinations/pollinations",
            source: "github",
        },
        remotes: [
            {
                type: "streamable-http",
                url: `${ORIGIN}/mcp/${server.id}`,
                headers: [
                    {
                        name: "Authorization",
                        description: `Bearer <Pollinations API key>. Get a key at ${KEYS_URL}`,
                        isRequired: true,
                        isSecret: true,
                    },
                ],
            },
        ],
    };
    writeFileSync(
        join(outDir, `${server.id}.json`),
        `${JSON.stringify(serverJson, null, 2)}\n`,
    );
}

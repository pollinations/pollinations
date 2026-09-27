import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    MCP_SERVERS,
    type McpServerDefinition,
} from "../../shared/registry/mcp.ts";

const GEN_ORIGIN = "https://gen.pollinations.ai";
const SETUP_DOCS_URL = `${GEN_ORIGIN}/docs#tag/mcp-servers`;
const API_KEY_URL = "https://enter.pollinations.ai/keys";
const REPOSITORY_URL = "https://github.com/pollinations/pollinations";

// The official registry caps `description` at 100 characters; a few of our
// product descriptions run longer, so give those a shorter registry-only version.
const REGISTRY_DESCRIPTION_OVERRIDES: Record<string, string> = {
    composio:
        "Read Gmail, search GitHub, update Sheets, and post to Slack through Composio.",
};

export function buildServerJson(server: McpServerDefinition, version: string) {
    const description =
        REGISTRY_DESCRIPTION_OVERRIDES[server.id] ?? server.description;
    return {
        $schema:
            "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: `io.github.pollinations/${server.id}`,
        title: server.name,
        description,
        version,
        repository: {
            url: REPOSITORY_URL,
            source: "github",
        },
        websiteUrl: SETUP_DOCS_URL,
        remotes: [
            {
                type: "streamable-http",
                url: `${GEN_ORIGIN}/mcp/${server.id}`,
                headers: [
                    {
                        name: "Authorization",
                        description: `Pollinations API key as a Bearer token. Get one at ${API_KEY_URL}.`,
                        isRequired: true,
                        isSecret: true,
                    },
                ],
            },
        ],
    };
}

function main() {
    const [outDir, version = "1.0.0"] = process.argv.slice(2);
    if (!outDir) {
        console.error(
            "Usage: tsx generate-server-json.ts <output-dir> [version]",
        );
        process.exit(1);
    }
    mkdirSync(outDir, { recursive: true });
    for (const server of MCP_SERVERS) {
        const path = join(outDir, `${server.id}.server.json`);
        writeFileSync(
            path,
            `${JSON.stringify(buildServerJson(server, version), null, 4)}\n`,
        );
        console.log(`Wrote ${path}`);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

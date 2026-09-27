// Turns shared/registry/mcp.ts into one server.json per hosted MCP server, in
// the official MCP registry's format (https://modelcontextprotocol.io/registry).
// Adding a server to that file is enough for it to reach the registry on the
// next publish — nobody hand-writes an entry.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
    MCP_SERVERS,
    type McpServerDefinition,
} from "../../shared/registry/mcp.ts";

const GEN_ORIGIN = "https://gen.pollinations.ai";
const KEYS_URL = "https://enter.pollinations.ai/keys";

// The registry caps `description` at 100 characters; composio's product
// description runs longer, so it gets a shorter registry-only one.
const DESCRIPTION_OVERRIDES: Partial<
    Record<McpServerDefinition["id"], string>
> = {
    composio:
        "Read Gmail, search GitHub, update Sheets, and post to Slack through Composio.",
};

export function buildServerEntry(server: McpServerDefinition, version: string) {
    return {
        $schema:
            "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: `io.github.pollinations/${server.id}`,
        title: server.name,
        description: DESCRIPTION_OVERRIDES[server.id] ?? server.description,
        version,
        websiteUrl: `${GEN_ORIGIN}/docs#tag/mcp-servers`,
        repository: {
            url: "https://github.com/pollinations/pollinations",
            source: "github" as const,
        },
        remotes: [
            {
                type: "streamable-http" as const,
                url: `${GEN_ORIGIN}/mcp/${server.id}`,
                headers: [
                    {
                        name: "Authorization",
                        description: `Pollinations API key. Get one at ${KEYS_URL}.`,
                        isRequired: true,
                        isSecret: true,
                        // The gateway requires the literal "Bearer " prefix; bake
                        // it in so the client only ever prompts for the key.
                        value: "Bearer {api_key}",
                        variables: {
                            api_key: {
                                description: "Pollinations API key",
                                isRequired: true,
                                isSecret: true,
                            },
                        },
                    },
                ],
            },
        ],
    };
}

function todayVersion(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}.${now.getUTCMonth() + 1}.${now.getUTCDate()}`;
}

function main() {
    const [outDir, version = todayVersion()] = process.argv.slice(2);
    if (!outDir) {
        console.error(
            "Usage: tsx generate-server-json.ts <output-dir> [version]",
        );
        process.exit(1);
    }
    mkdirSync(outDir, { recursive: true });
    for (const server of MCP_SERVERS) {
        const path = join(outDir, `${server.id}.json`);
        writeFileSync(
            path,
            `${JSON.stringify(buildServerEntry(server, version), null, 4)}\n`,
        );
        console.log(`Wrote ${path}`);
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main();
}

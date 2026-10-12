// Builds an MCP server.json entry (https://modelcontextprotocol.io/registry)
// from shared/registry/mcp.ts. The registry publisher and gen's SEP-2127
// Server Cards both use it, so the card and the registry entry can't drift.
import type { McpServerDefinition } from "./mcp.ts";

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

export function buildServerEntry(
    server: McpServerDefinition,
    version: string,
    origin = GEN_ORIGIN,
) {
    return {
        $schema:
            "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: `io.github.pollinations/${server.id}`,
        title: server.name,
        description: DESCRIPTION_OVERRIDES[server.id] ?? server.description,
        version,
        websiteUrl: `${origin}/docs#tag/mcp-servers`,
        repository: {
            url: "https://github.com/pollinations/pollinations",
            source: "github" as const,
        },
        remotes: [
            {
                type: "streamable-http" as const,
                url: `${origin}/mcp/${server.id}`,
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

// List of discovery endpoints and short descriptions following llmstxt.org / agent-skills.org standards.
// Matches what gen.pollinations.ai/llms.txt currently serves.
export const discoverData = [
    {
        name: "Full API guide",
        href: "https://gen.pollinations.ai/llms-full.txt",
        description: "Complete API guide, CLI skill, and task recipes",
    },
    {
        name: "Polli CLI tasks",
        href: "https://gen.pollinations.ai/docs/polli-tasks.md",
        description:
            "Task recipes for connecting OpenCode or generating images",
    },
    {
        name: "Polli skill",
        href: "https://gen.pollinations.ai/docs/polli-skill.md",
        description:
            "Authentication, structured output, and common CLI commands",
    },
    {
        name: "Agent Skills index",
        href: "https://gen.pollinations.ai/.well-known/agent-skills/index.json",
        description: "Install the polli skill via Agent Skills discovery",
    },
    {
        name: "OpenAPI schema",
        href: "https://gen.pollinations.ai/openapi.json",
        description: "Current REST API endpoints and request schemas",
    },
    {
        name: "MCP server catalog",
        href: "https://gen.pollinations.ai/mcp",
        description:
            "Agent tools and server URLs for the Model Context Protocol",
    },
    {
        name: "OAuth resource metadata",
        href: "https://gen.pollinations.ai/.well-known/oauth-protected-resource",
        description: "RFC 9728 authorization server for API keys",
    },
    {
        name: "AI catalog (SEP-2127)",
        href: "https://gen.pollinations.ai/.well-known/ai-catalog.json",
        description: "SEP-2127 discovery for MCP Server Cards",
    },
];

export const discoverTools = [
    [
        "list_discovery_endpoints",
        "Return a structured list of Pollinations discovery endpoints per llmstxt.org and agent-skills.org standards. Each entry includes name, URL (href), and one-line description. Useful for agents that need to know what services and tools are available at Pollinations.ai without fetching llms.txt manually.",
        {},
        async () => ({
            endpoints: discoverData,
            count: discoverData.length,
        }),
    ],
];

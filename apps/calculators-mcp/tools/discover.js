// The "Start here" links from https://gen.pollinations.ai/llms.txt, which follows
// llmstxt.org. Kept as data so the answer is one tool call instead of a fetch and a parse.
export const discoverData = [
    {
        name: "Full API guide",
        href: "https://gen.pollinations.ai/llms-full.txt",
        description:
            "The API guide, CLI skill, and task recipes in a single request.",
    },
    {
        name: "Polli CLI task recipes",
        href: "https://gen.pollinations.ai/docs/polli-tasks.md",
        description:
            "Connect OpenCode or generate an image, with a check for the first result.",
    },
    {
        name: "Polli CLI agent skill",
        href: "https://gen.pollinations.ai/docs/polli-skill.md",
        description:
            "Commands, authentication, structured output, and common tasks.",
    },
    {
        name: "Agent Skills index",
        href: "https://gen.pollinations.ai/.well-known/agent-skills/index.json",
        description:
            "Install the polli skill with any Agent Skills discovery client.",
    },
    {
        name: "Direct REST API skill",
        href: "https://gen.pollinations.ai/.well-known/agent-skills/pollinations-api/SKILL.md",
        description:
            "Call the API with curl or fetch when the CLI cannot be installed.",
    },
    {
        name: "Pollinations SDK skill",
        href: "https://gen.pollinations.ai/.well-known/agent-skills/pollinations-sdk/SKILL.md",
        description: "Use the official npm SDK from code with an API key.",
    },
    {
        name: "Pollinations Pay skill",
        href: "https://gen.pollinations.ai/.well-known/agent-skills/bring-your-own-pollen/SKILL.md",
        description:
            "Let users authorize your app with OAuth PKCE, the fragment flow, or the device flow and spend from their own balance.",
    },
    {
        name: "API catalog",
        href: "https://gen.pollinations.ai/.well-known/api-catalog",
        description:
            "RFC 9727 linkset pointing agents at the OpenAPI schema and the plain-text API guide.",
    },
    {
        name: "API quick start and reference",
        href: "https://gen.pollinations.ai/docs/llm.txt",
        description: "Plain-text API reference and guides.",
    },
    {
        name: "Interactive API docs",
        href: "https://gen.pollinations.ai/docs",
        description: "Browse endpoints and examples in a browser.",
    },
    {
        name: "OpenAPI schema",
        href: "https://gen.pollinations.ai/openapi.json",
        description: "Current endpoints and request schemas.",
    },
    {
        name: "Live model catalog",
        href: "https://gen.pollinations.ai/models",
        description: "Current model IDs and capabilities.",
    },
    {
        name: "MCP server catalog",
        href: "https://gen.pollinations.ai/mcp",
        description: "Agent tools and server URLs.",
    },
    {
        name: "OAuth protected resource metadata",
        href: "https://gen.pollinations.ai/.well-known/oauth-protected-resource",
        description:
            "RFC 9728 pointer to the authorization server that issues API keys.",
    },
    {
        name: "MCP AI Catalog",
        href: "https://gen.pollinations.ai/.well-known/ai-catalog.json",
        description: "SEP-2127 discovery of MCP Server Cards.",
    },
    {
        name: "Quest contributor agent skill",
        href: "https://gen.pollinations.ai/.well-known/agent-skills/quest-contributor/SKILL.md",
        description:
            "Find a community quest, submit a PR, and claim what you earned in Quest balance.",
    },
];

export const discoverTools = [
    [
        "list_discovery_endpoints",
        "Return the discovery endpoints Pollinations publishes in llms.txt (llmstxt.org and agent-skills.org), each with a name, URL (href), and one-line description. Useful for agents that need to find the API guide, skills, OpenAPI schema or MCP catalog without fetching llms.txt and parsing markdown.",
        {},
        async () => ({
            endpoints: discoverData,
            count: discoverData.length,
        }),
    ],
];

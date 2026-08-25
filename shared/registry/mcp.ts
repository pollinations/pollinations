export type McpBindingName = "POLLINATIONS_MCP";

export type McpServerDefinition = {
    id: string;
    name: string;
    description: string;
    binding: McpBindingName;
};

export const MCP_SERVERS = [
    {
        id: "pollinations",
        name: "Pollinations",
        description:
            "Access Pollinations models and API capabilities through agent tools.",
        binding: "POLLINATIONS_MCP",
    },
] as const satisfies readonly McpServerDefinition[];

export type McpServerId = (typeof MCP_SERVERS)[number]["id"];
export const MCP_SERVER_IDS = MCP_SERVERS.map(({ id }) => id) as [
    McpServerId,
    ...McpServerId[],
];

export function getMcpServerDefinition(
    id: string,
): McpServerDefinition | undefined {
    return MCP_SERVERS.find((server) => server.id === id);
}

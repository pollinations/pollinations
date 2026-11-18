import { z } from "zod";

const API_URL = "https://valorant-api.com/v1/agents?isPlayableCharacter=true";
const DESCRIPTION_LIMIT = 500;

function formatAgent(agent) {
    return {
        name: agent.displayName ?? null,
        description: agent.description
            ? agent.description.slice(0, DESCRIPTION_LIMIT)
            : null,
        role: agent.role?.displayName ?? null,
    };
}

export const valorantTools = [
    [
        "valorant_agent",
        "Find Valorant playable agents by name substring, returning each agent's role and description.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Agent-name substring to match, case-insensitive (e.g. 'gekko')",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of agents to return (1-10, default 5)",
                ),
        },
        async ({ name, limit }, fetchJson) => {
            const term = name.trim();
            if (!term) throw new Error("Provide an agent name to search for.");
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const data = await fetchJson(API_URL);
            if (!Array.isArray(data?.data))
                throw new Error(
                    "Valorant API returned an unexpected response.",
                );
            const query = term.toLowerCase();
            const matches = data.data.filter((agent) =>
                String(agent.displayName ?? "")
                    .toLowerCase()
                    .includes(query),
            );
            return {
                query: term,
                total: matches.length,
                agents: matches.slice(0, count).map(formatAgent),
            };
        },
    ],
];

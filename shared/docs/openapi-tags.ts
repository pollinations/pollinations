/**
 * Canonical OpenAPI tag strings shared by enter and gen (#11992).
 * Tag merge dedupes by exact string — keep a single source of truth.
 */
export const OPENAPI_TAGS = {
    account: "👤 Account",
    quests: "✨ Quests",
    communityModels: "🧩 Community Models",
    communityAgents: "🤖 Community Agents",
    connectedApps: "🔗 Account",
} as const;

export type OpenApiTag = (typeof OPENAPI_TAGS)[keyof typeof OPENAPI_TAGS];

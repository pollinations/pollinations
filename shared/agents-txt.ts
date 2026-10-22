// agents.txt / agents.json capability declaration — agents-txt.com v1.0.
// https://agents-txt.com/spec/
//
// `agents.txt` is the "Layer 4" discovery file: it tells an agent which
// protocols and endpoints a site speaks. It complements robots.txt (access
// policy), sitemap.xml (page inventory) and llms.txt (content curation) —
// none of which declare what an agent can *do* on a site.
//
// The MCP and Skills blocks are derived from the live registries by the
// caller, so the declaration cannot drift from what the worker serves.
// Keep this module free of worker-only imports: both gen and enter build
// their declaration from it.

export const AGENTS_TXT_STANDARD = "https://agents-txt.com";
export const AGENTS_JSON_SCHEMA =
    "https://agents-txt.com/schema/agents-json/v1.0.json";

/** One endpoint advertised in a repeatable block (`MCP:`, `Skills:`, ...). */
export type AgentsTxtEndpoint = {
    url: string;
    description?: string;
};

export type AgentsTxtConfig = {
    /** Public origin of the serving host, e.g. `https://gen.pollinations.ai`. */
    origin: string;
    name: string;
    description?: string;
    /** Streamable HTTP MCP endpoints, one `MCP:` line each. */
    mcp?: AgentsTxtEndpoint[];
    /** Agent Skills packages, one `Skills:` line each. */
    skills?: AgentsTxtEndpoint[];
    /**
     * Registered `Authorization:` protocol identifiers (agents-txt.com §11),
     * e.g. `oauth2`. Omitted entirely when the site declares none.
     */
    authorizationProtocols?: string[];
};

/**
 * Builds the plain-text declaration. Blocks follow the spec's example order
 * (payments, authorization, MCP, skills, ...) and are separated by a blank
 * line. Empty blocks are omitted rather than emitted empty, so a site with no
 * capabilities still serves a valid header-only file.
 */
export function buildAgentsTxt(config: AgentsTxtConfig): string {
    const blocks: string[][] = [];

    const authorization = config.authorizationProtocols?.filter(Boolean) ?? [];
    if (authorization.length > 0) {
        blocks.push([`Authorization: ${authorization.join(", ")}`]);
    }

    const mcp = (config.mcp ?? []).map((server) => `MCP: ${server.url}`);
    if (mcp.length > 0) blocks.push(mcp);

    const skills = (config.skills ?? []).map((skill) => `Skills: ${skill.url}`);
    if (skills.length > 0) blocks.push(skills);

    const header = [
        "# agents.txt",
        `# Standard: ${AGENTS_TXT_STANDARD}`,
        `# JSON: ${config.origin}/agents.json`,
    ];
    if (blocks.length === 0) return `${header.join("\n")}\n`;

    return `${[...header, "", blocks.map((b) => b.join("\n")).join("\n\n")].join("\n")}\n`;
}

/**
 * Builds the structured companion. Mirrors `agents.txt`: the same blocks, in
 * the same order, plus the richer per-entry fields the spec reserves for JSON
 * (`mcp[].type`, optional descriptions). Absent blocks are omitted.
 */
export function buildAgentsJson(config: AgentsTxtConfig): {
    $schema: string;
    version: string;
    standard: string;
    site: { name: string; url: string; description?: string };
    authorization?: { protocols: string[] };
    mcp?: { url: string; type: string; description?: string }[];
    skills?: { url: string; description?: string }[];
} {
    const json: {
        $schema: string;
        version: string;
        standard: string;
        site: { name: string; url: string; description?: string };
        authorization?: { protocols: string[] };
        mcp?: { url: string; type: string; description?: string }[];
        skills?: { url: string; description?: string }[];
    } = {
        $schema: AGENTS_JSON_SCHEMA,
        version: "1.0",
        standard: AGENTS_TXT_STANDARD,
        site: {
            name: config.name,
            url: config.origin,
            ...(config.description ? { description: config.description } : {}),
        },
    };

    const authorization = config.authorizationProtocols?.filter(Boolean) ?? [];
    if (authorization.length > 0) {
        json.authorization = { protocols: authorization };
    }

    const mcp = config.mcp ?? [];
    if (mcp.length > 0) {
        json.mcp = mcp.map((server) => ({
            url: server.url,
            // agents-txt.com §5.3: always streamable-http for HTTP endpoints.
            type: "streamable-http",
            ...(server.description ? { description: server.description } : {}),
        }));
    }

    const skills = config.skills ?? [];
    if (skills.length > 0) {
        json.skills = skills.map((skill) => ({
            url: skill.url,
            ...(skill.description ? { description: skill.description } : {}),
        }));
    }

    return json;
}

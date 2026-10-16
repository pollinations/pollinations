import { OAUTH_SCOPES } from "@shared/auth/authorize-config.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { MCP_SERVERS } from "@shared/registry/mcp.ts";
import { Hono } from "hono";
import { etag } from "hono/etag";
import type { Env } from "@/env.ts";
import BYOP_SKILL from "../../../.claude/skills/bring-your-own-pollen/SKILL.md?raw";
import API_SKILL from "../../../.claude/skills/pollinations-api/SKILL.md?raw";
import SDK_SKILL from "../../../.claude/skills/pollinations-sdk/SKILL.md?raw";
import QUEST_CONTRIBUTOR_SKILL from "../../../.claude/skills/quest-contributor/SKILL.md?raw";
import CLI_SKILL from "../../../packages/polli-cli/SKILL.md?raw";
import { SERVER_CARD_MEDIA_TYPE } from "./mcp-card.ts";

// Agent Skills discovery (RFC 8615 well-known URI), schema v0.2.0:
// https://github.com/cloudflare/agent-skills-discovery-rfc
const SKILLS_SCHEMA =
    "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

// One entry per published skill; served at /agent-skills/<name>/SKILL.md.
const AGENT_SKILLS = [
    { name: "polli", markdown: CLI_SKILL },
    { name: "pollinations-api", markdown: API_SKILL },
    { name: "bring-your-own-pollen", markdown: BYOP_SKILL },
    { name: "quest-contributor", markdown: QUEST_CONTRIBUTOR_SKILL },
    { name: "pollinations-sdk", markdown: SDK_SKILL },
].map((skill) => ({
    ...skill,
    path: `/.well-known/agent-skills/${skill.name}/SKILL.md`,
    description:
        skill.markdown.match(/^description:\s*(.+)$/m)?.[1].trim() ?? "",
}));

async function sha256Hex(text: string): Promise<string> {
    const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
    );
    return [...new Uint8Array(hash)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

// One entry per hosted MCP server's Server Card. The SEP-2127 AI Catalog and
// the ARD manifest share this list, so the two can't drift. Both schemas
// require a per-entry displayName (ards-project/ard-spec, ai-catalog v1.0).
function buildCatalogEntries(origin: string) {
    return MCP_SERVERS.map((server) => ({
        identifier: `urn:air:pollinations.ai:mcp:${server.id}`,
        displayName: server.name,
        type: SERVER_CARD_MEDIA_TYPE,
        url: `${origin}/mcp/${server.id}/server-card`,
    }));
}

export const wellKnownRoutes = new Hono<Env>()
    // SEP-2127 AI Catalog: one entry per hosted MCP server's Server Card.
    .get("/ai-catalog.json", etag(), (c) => {
        const origin = getPublicOrigin(c);
        c.header("Content-Type", "application/ai-catalog+json; charset=utf-8");
        c.header("Cache-Control", "public, max-age=3600");
        return c.body(
            JSON.stringify(
                {
                    specVersion: "1.0",
                    entries: buildCatalogEntries(origin),
                },
                null,
                2,
            ),
        );
    })
    // Agentic Resource Discovery manifest: the canonical entry source path;
    // the ai-catalog.json predecessor path stays for compatibility.
    .get("/ard.json", etag(), (c) => {
        const origin = getPublicOrigin(c);
        c.header("Content-Type", "application/json; charset=utf-8");
        c.header("Cache-Control", "public, max-age=3600");
        return c.body(
            JSON.stringify({ entries: buildCatalogEntries(origin) }, null, 2),
        );
    })
    .get("/agent-skills/index.json", async (c) => {
        c.header("Cache-Control", "public, max-age=3600");
        return c.json({
            $schema: SKILLS_SCHEMA,
            skills: await Promise.all(
                AGENT_SKILLS.map(async (skill) => ({
                    name: skill.name,
                    type: "skill-md",
                    description: skill.description,
                    url: skill.path,
                    digest: `sha256:${await sha256Hex(skill.markdown)}`,
                })),
            ),
        });
    })
    .get("/agent-skills/:name/SKILL.md", (c) => {
        const skill = AGENT_SKILLS.find((s) => s.name === c.req.param("name"));
        if (!skill) return c.notFound();
        c.header("Content-Type", "text/markdown; charset=utf-8");
        c.header("Cache-Control", "public, max-age=3600");
        return c.body(skill.markdown);
    })
    .get("/api-catalog", (c) => {
        // RFC 9727 API catalog (linkset): lets agents discover the OpenAPI
        // schema and the plain-text API guide without prior URL knowledge.
        // The origin follows the serving host (staging serves staging), like
        // llms.txt.
        const origin = getPublicOrigin(c);
        c.header(
            "Content-Type",
            'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
        );
        c.header("Cache-Control", "public, max-age=3600");
        // RFC 9727 section 2: HEAD must answer with an api-catalog Link.
        c.header(
            "Link",
            `<${origin}/.well-known/api-catalog>; rel="api-catalog"`,
        );
        return c.body(
            JSON.stringify({
                linkset: [
                    {
                        anchor: origin,
                        "service-desc": [
                            {
                                href: `${origin}/openapi.json`,
                                type: "application/json",
                            },
                        ],
                        "service-doc": [
                            {
                                href: `${origin}/docs/llm.txt`,
                                type: "text/plain",
                            },
                        ],
                    },
                ],
            }),
        );
    })
    .get("/oauth-protected-resource", (c) => {
        // RFC 9728: tells an agent that hits a 401 here which authorization
        // server issues keys. enter hosts the RFC 8414 metadata.
        const origin = getPublicOrigin(c);
        c.header("Cache-Control", "public, max-age=3600");
        return c.json({
            resource: origin,
            authorization_servers: [
                origin.replace("gen.pollinations.ai", "enter.pollinations.ai"),
            ],
            scopes_supported: [...OAUTH_SCOPES],
            bearer_methods_supported: ["header"],
            resource_name: "Pollinations API",
            resource_documentation: `${origin}/docs/llm.txt`,
        });
    });

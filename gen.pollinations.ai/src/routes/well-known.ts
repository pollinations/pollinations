import { getPublicOrigin } from "@shared/public-origin.ts";
import { MCP_SERVERS } from "@shared/registry/mcp.ts";
import { Hono } from "hono";
import { etag } from "hono/etag";
import type { Env } from "@/env.ts";
import API_SKILL from "../../../.claude/skills/pollinations-api/SKILL.md?raw";
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
    { name: "quest-contributor", markdown: QUEST_CONTRIBUTOR_SKILL },
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
                    entries: MCP_SERVERS.map((server) => ({
                        identifier: `urn:air:pollinations.ai:mcp:${server.id}`,
                        type: SERVER_CARD_MEDIA_TYPE,
                        url: `${origin}/mcp/${server.id}/server-card`,
                    })),
                },
                null,
                2,
            ),
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
    });

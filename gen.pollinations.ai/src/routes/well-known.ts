import { getPublicOrigin } from "@shared/public-origin.ts";
import { Hono } from "hono";
import type { Env } from "@/env.ts";
import CLI_SKILL from "../../../packages/polli-cli/SKILL.md?raw";

// Agent Skills discovery (RFC 8615 well-known URI), schema v0.2.0:
// https://github.com/cloudflare/agent-skills-discovery-rfc
const SKILLS_SCHEMA =
    "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
const POLLI_SKILL_PATH = "/.well-known/agent-skills/polli/SKILL.md";
const POLLI_SKILL_DESCRIPTION =
    CLI_SKILL.match(/^description:\s*(.+)$/m)?.[1].trim() ?? "";

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
    .get("/agent-skills/index.json", async (c) => {
        c.header("Cache-Control", "public, max-age=3600");
        return c.json({
            $schema: SKILLS_SCHEMA,
            skills: [
                {
                    name: "polli",
                    type: "skill-md",
                    description: POLLI_SKILL_DESCRIPTION,
                    url: POLLI_SKILL_PATH,
                    digest: `sha256:${await sha256Hex(CLI_SKILL)}`,
                },
            ],
        });
    })
    .get("/agent-skills/polli/SKILL.md", (c) => {
        c.header("Content-Type", "text/markdown; charset=utf-8");
        c.header("Cache-Control", "public, max-age=3600");
        return c.body(CLI_SKILL);
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

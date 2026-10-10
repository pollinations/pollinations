import { Hono } from "hono";
import type { Env } from "@/env.ts";
import CLI_SKILL from "../../../packages/polli-cli/SKILL.md?raw";
import API_SKILL from "../../../packages/polli-cli/SKILL-API.md?raw";

// Agent Skills discovery (RFC 8615 well-known URI), schema v0.2.0:
// https://github.com/cloudflare/agent-skills-discovery-rfc
const SKILLS_SCHEMA =
    "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
const POLLI_SKILL_PATH = "/.well-known/agent-skills/polli/SKILL.md";
const API_SKILL_PATH = "/.well-known/agent-skills/pollinations-api/SKILL.md";
const POLLI_SKILL_DESCRIPTION =
    CLI_SKILL.match(/^description:\s*(.+)$/m)?.[1].trim() ?? "";
const API_SKILL_DESCRIPTION =
    API_SKILL.match(/^description:\s*(.+)$/m)?.[1].trim() ?? "";

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
                {
                    name: "pollinations-api",
                    type: "skill-md",
                    description: API_SKILL_DESCRIPTION,
                    url: API_SKILL_PATH,
                    digest: `sha256:${await sha256Hex(API_SKILL)}`,
                },
            ],
        });
    })
    .get("/agent-skills/polli/SKILL.md", (c) => {
        c.header("Content-Type", "text/markdown; charset=utf-8");
        c.header("Cache-Control", "public, max-age=3600");
        return c.body(CLI_SKILL);
    })
    .get("/agent-skills/pollinations-api/SKILL.md", (c) => {
        c.header("Content-Type", "text/markdown; charset=utf-8");
        c.header("Cache-Control", "public, max-age=3600");
        return c.body(API_SKILL);
    });

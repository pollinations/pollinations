import { buildAgentsJson, buildAgentsTxt } from "@shared/agents-txt.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { MCP_SERVERS } from "@shared/registry/mcp.ts";
import { Hono } from "hono";
import type { Env } from "@/env.ts";
import { AGENT_SKILLS } from "./well-known.ts";

// agents.txt v1.0 (https://agents-txt.com/spec/) — the capability declaration
// layer for agents. llms.txt tells an agent what we publish; agents.txt tells
// it what it can *do* here: which MCP servers to connect to, which skill
// packages to load, and that the API is OAuth-protected.
//
// Both blocks are derived from the live registries, so the declaration cannot
// drift from what the worker actually serves.
//
// gen is the protected resource: it publishes RFC 9728 metadata at
// /.well-known/oauth-protected-resource naming enter as the authorization
// server, so `Authorization: oauth2` is accurate here. The x402 prepaid-key
// endpoint lives on enter, so no `Protocols:` block is declared on this origin.
function declaration(origin: string) {
    return {
        origin,
        name: "Pollinations",
        description:
            "Text, image, video, audio, realtime and embedding generation through one OpenAI-compatible API.",
        // MCP_SERVERS is the same source the /mcp catalog, the SEP-2127 server
        // cards and the registry publisher use.
        mcp: MCP_SERVERS.map((server) => ({
            url: `${origin}/mcp/${server.id}`,
            description: server.description,
        })),
        // The same five skills the Agent Skills discovery index advertises.
        skills: AGENT_SKILLS.map((skill) => ({
            url: `${origin}${skill.path}`,
            description: skill.description,
        })),
        authorizationProtocols: ["oauth2"],
    };
}

export const agentsTxtRoutes = new Hono<Env>()
    .get("/agents.txt", (c) => {
        c.header("Content-Type", "text/plain; charset=utf-8");
        c.header("Cache-Control", "public, max-age=3600");
        return c.body(buildAgentsTxt(declaration(getPublicOrigin(c))));
    })
    .get("/agents.json", (c) => {
        c.header("Content-Type", "application/json; charset=utf-8");
        c.header("Cache-Control", "public, max-age=3600");
        return c.json(buildAgentsJson(declaration(getPublicOrigin(c))));
    });

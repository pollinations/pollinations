import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { MCP_SERVERS } from "@shared/registry/mcp.ts";
import { describe, expect, it } from "vitest";
import worker from "../src/index.ts";
import { AGENT_SKILLS } from "../src/routes/well-known.ts";

// agents-txt.com v1.0 (https://agents-txt.com/spec/). The declaration must
// agree with the registries it is derived from: agents-txt.com §7.5 requires
// the Skills URLs to match the Agent Skills discovery index, and the MCP URLs
// to match the /mcp catalog.
const ORIGIN = "https://staging.gen.pollinations.ai";

async function fetchWorker(path: string) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`${ORIGIN}${path}`),
        { ENVIRONMENT: "test" } as CloudflareBindings,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

describe("agents.txt v1.0 capability declaration", () => {
    it("serves agents.txt as plain text with the standard header", async () => {
        const res = await fetchWorker("/agents.txt");
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("text/plain");

        const body = await res.text();
        expect(body).toContain("# agents.txt");
        expect(body).toContain("# Standard: https://agents-txt.com");
        expect(body).toContain(`# JSON: ${ORIGIN}/agents.json`);
    });

    it("declares the OAuth authorization protocol", async () => {
        const body = await (await fetchWorker("/agents.txt")).text();
        expect(body).toContain("Authorization: oauth2");
    });

    it("declares one MCP line per hosted MCP server, at its real endpoint", async () => {
        const body = await (await fetchWorker("/agents.txt")).text();
        const mcpLines = body
            .split("\n")
            .filter((line) => line.startsWith("MCP: "))
            .map((line) => line.slice("MCP: ".length));

        expect(mcpLines).toHaveLength(MCP_SERVERS.length);
        expect(mcpLines).toEqual(
            MCP_SERVERS.map((server) => `${ORIGIN}/mcp/${server.id}`),
        );
    });

    it("declares one Skills line per published Agent Skill", async () => {
        const body = await (await fetchWorker("/agents.txt")).text();
        const skillLines = body
            .split("\n")
            .filter((line) => line.startsWith("Skills: "))
            .map((line) => line.slice("Skills: ".length));

        expect(skillLines).toHaveLength(AGENT_SKILLS.length);
        expect(skillLines).toEqual(
            AGENT_SKILLS.map((skill) => `${ORIGIN}${skill.path}`),
        );
    });

    it("serves the structured companion", async () => {
        const res = await fetchWorker("/agents.json");
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("application/json");

        const json = (await res.json()) as {
            $schema: string;
            version: string;
            standard: string;
            site: { name: string; url: string; description?: string };
            authorization: { protocols: string[] };
            mcp: { url: string; type: string; description?: string }[];
            skills: { url: string; description?: string }[];
        };

        expect(json.$schema).toBe(
            "https://agents-txt.com/schema/agents-json/v1.0.json",
        );
        expect(json.version).toBe("1.0");
        expect(json.standard).toBe("https://agents-txt.com");
        expect(json.site.name).toBe("Pollinations");
        expect(json.site.url).toBe(ORIGIN);
        expect(json.site.description).toBeTruthy();

        expect(json.authorization.protocols).toEqual(["oauth2"]);
        expect(json.mcp.map((entry) => entry.url)).toEqual(
            MCP_SERVERS.map((server) => `${ORIGIN}/mcp/${server.id}`),
        );
        expect(
            json.mcp.every((entry) => entry.type === "streamable-http"),
        ).toBe(true);
        expect(json.skills.map((entry) => entry.url)).toEqual(
            AGENT_SKILLS.map((skill) => `${ORIGIN}${skill.path}`),
        );
    });

    it("keeps agents.txt and agents.json in agreement", async () => {
        // agents-txt.com §7.5: the two surfaces must list the same endpoints.
        // A silent divergence is the failure mode this guards against.
        const txt = await (await fetchWorker("/agents.txt")).text();
        const json = (await (await fetchWorker("/agents.json")).json()) as {
            mcp: { url: string }[];
            skills: { url: string }[];
        };

        const txtUrls = txt
            .split("\n")
            .filter((line) => /^(MCP|Skills): /.test(line))
            .map((line) => line.replace(/^(MCP|Skills): /, ""))
            .sort();
        const jsonUrls = [...json.mcp, ...json.skills]
            .map((entry) => entry.url)
            .sort();

        expect(txtUrls).toEqual(jsonUrls);
    });

    it("advertises the file in robots.txt", async () => {
        const res = await fetchWorker("/robots.txt");
        expect(res.status).toBe(200);
        const body = await res.text();
        expect(body).toContain("Allow: /agents.txt");
    });
});

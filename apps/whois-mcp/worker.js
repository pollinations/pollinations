import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const RDAP = "https://rdap.org";
const RDAP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; whois-mcp/0.1)",
    Accept: "application/rdap+json, application/json",
};

async function rdapGet(path) {
    const res = await fetch(`${RDAP}${path}`, { headers: RDAP_HEADERS });
    if (!res.ok) return null;
    try {
        return await res.json();
    } catch (_err) {
        return null;
    }
}

function pickEvents(events) {
    const out = {};
    for (const e of events ?? []) {
        const key = String(e.eventAction || "event");
        if (!out[key]) out[key] = e.eventDate;
    }
    return out;
}

function summarizeDomain(d) {
    return {
        domain: d.ldhName?.toLowerCase() ?? null,
        handle: d.handle ?? null,
        status: d.status ?? [],
        events: pickEvents(d.events),
        nameservers: (d.nameservers ?? []).map((n) => n.ldhName?.toLowerCase()),
        registrar:
            (d.entities ?? [])
                .filter((e) => (e.roles ?? []).includes("registrar"))
                .map((e) =>
                    (e.vcardArray?.[1] ?? [])
                        .filter((v) => v[0] === "fn")
                        .map((v) => v[3])
                        .join(""),
                )[0] ?? null,
    };
}

function summarizeIp(d) {
    return {
        handle: d.handle ?? null,
        name: d.name ?? null,
        country: d.country ?? null,
        type: d.type ?? null,
        ipVersion: d.ipVersion ?? null,
        startAddress: d.startAddress ?? null,
        endAddress: d.endAddress ?? null,
        events: pickEvents(d.events),
        status: d.status ?? [],
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "whois-mcp", title: "RDAP Whois MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "domain_whois",
        {
            description:
                "Look up domain registration data (registrar, creation/expiry dates, nameservers, " +
                "status) using the public RDAP service. Free, no API key required.",
            inputSchema: z.object({
                domain: z
                    .string()
                    .min(1)
                    .describe("Domain name, e.g. example.com"),
            }),
        },
        async ({ domain }) => {
            const target = domain.toLowerCase().trim();
            const data = await rdapGet(`/domain/${encodeURIComponent(target)}`);
            if (!data) {
                return createMCPResponse([
                    createTextContent(
                        { error: `RDAP lookup failed for ${target}` },
                        true,
                    ),
                ]);
            }
            return createMCPResponse([
                createTextContent(summarizeDomain(data), true),
            ]);
        },
    );

    server.registerTool(
        "ip_whois",
        {
            description:
                "Look up network registration data for an IP address (owner, country, allocated " +
                "range, registration dates) using the public RDAP service. Free, no API key required.",
            inputSchema: z.object({
                ip: z
                    .string()
                    .min(1)
                    .describe("IPv4 or IPv6 address, e.g. 8.8.8.8"),
            }),
        },
        async ({ ip }) => {
            const target = ip.trim();
            const data = await rdapGet(`/ip/${encodeURIComponent(target)}`);
            if (!data) {
                return createMCPResponse([
                    createTextContent(
                        { error: `RDAP lookup failed for ${target}` },
                        true,
                    ),
                ]);
            }
            return createMCPResponse([
                createTextContent(summarizeIp(data), true),
            ]);
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "whois-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        return mcpHandler.fetch(request);
    },
};

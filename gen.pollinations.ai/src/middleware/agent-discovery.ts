import type { MiddlewareHandler } from "hono";
import type { Env } from "@/env.ts";

// Pages whose responses advertise the machine entry points. Agents that start
// from the human-facing URL find the docs and catalogs without knowing their
// paths first.
const DISCOVERY_PATHS = new Set(["/", "/docs"]);

// RFC 8288 Web Linking, with relations from the IANA registry (RFC 8288
// §2.1.2) plus RFC 8631 (service-desc, service-doc) and RFC 9727
// (api-catalog). SEP-2127 discovery stays catalog-first; the describedby link
// only points agents at the AI catalog for agents that never fetch it.
export const AGENT_DISCOVERY_LINKS = [
    '</openapi.json>; rel="service-desc"',
    '</docs/llm.txt>; rel="service-doc"',
    '</.well-known/api-catalog>; rel="api-catalog"',
    '</.well-known/ai-catalog.json>; rel="describedby"',
].join(", ");

/**
 * Advertise the machine entry points on the landing and API reference pages.
 * Appends to an existing Link header, and only touches successful GET/HEAD
 * responses so redirects and machine endpoints keep their own metadata.
 */
export function agentDiscoveryLinks(): MiddlewareHandler<Env> {
    return async (c, next) => {
        await next();
        if (
            (c.req.method === "GET" || c.req.method === "HEAD") &&
            DISCOVERY_PATHS.has(c.req.path) &&
            c.res.status >= 200 &&
            c.res.status < 300
        ) {
            const existing = c.res.headers.get("Link");
            c.header(
                "Link",
                existing
                    ? `${existing}, ${AGENT_DISCOVERY_LINKS}`
                    : AGENT_DISCOVERY_LINKS,
            );
        }
    };
}

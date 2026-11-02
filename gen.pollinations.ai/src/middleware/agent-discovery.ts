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

type AcceptedRange = { type: string; subtype: string; quality: number };

function parseAccept(accept: string): AcceptedRange[] {
    return accept.split(",").flatMap((range) => {
        const [mediaType, ...params] = range.trim().toLowerCase().split(";");
        const [type, subtype] = mediaType.split("/").map((part) => part.trim());
        if (!type || !subtype) return [];

        const q = params
            .map((param) => param.trim())
            .find((param) => param.startsWith("q="));
        const quality = q === undefined ? 1 : Number(q.slice(2));
        // RFC 9110 §12.5.1: q is a 0..1 weight; a malformed q drops the range.
        return Number.isFinite(quality) && quality >= 0 && quality <= 1
            ? [{ type, subtype, quality }]
            : [];
    });
}

// The most specific matching range sets a media type's weight, so an explicit
// `text/markdown;q=0` overrides a permissive `*/*`.
function qualityFor(
    ranges: AcceptedRange[],
    type: string,
    subtype: string,
): number {
    const exact = ranges.filter(
        (range) => range.type === type && range.subtype === subtype,
    );
    const typeWildcard = ranges.filter(
        (range) => range.type === type && range.subtype === "*",
    );
    const wildcard = ranges.filter(
        (range) => range.type === "*" && range.subtype === "*",
    );
    const matches = exact.length
        ? exact
        : typeWildcard.length
          ? typeWildcard
          : wildcard;
    return matches.reduce((max, range) => Math.max(max, range.quality), 0);
}

export function acceptsMarkdown(accept: string): boolean {
    const ranges = parseAccept(accept);
    const requested = ranges.some(
        (range) => range.type === "text" && range.subtype === "markdown",
    );
    if (!requested) return false;

    const markdown = qualityFor(ranges, "text", "markdown");
    return markdown > 0 && markdown >= qualityFor(ranges, "text", "html");
}

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

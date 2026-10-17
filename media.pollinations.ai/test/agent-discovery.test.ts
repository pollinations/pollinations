import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";

const ORIGIN = "https://media.pollinations.ai";

test("serves an llms.txt entry point that names every endpoint", async () => {
    const response = await SELF.fetch(`${ORIGIN}/llms.txt`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
        "text/plain; charset=utf-8",
    );
    const text = await response.text();
    expect(text).toContain("# media.pollinations.ai");
    expect(text).toContain(`${ORIGIN}/openapi.json`);
    // An agent should not have to open the schema to learn the auth header.
    expect(text).toContain("Authorization: Bearer");
    for (const endpoint of [
        "POST /upload",
        "GET /{id}",
        "GET /{id}/metadata",
        "GET /media?tag={tag}",
        "DELETE /media/{id}",
    ]) {
        expect(text).toContain(endpoint);
    }
});

test("publishes an RFC 9727 API catalog for the schema and the guide", async () => {
    const response = await SELF.fetch(`${ORIGIN}/.well-known/api-catalog`);
    expect(response.status).toBe(200);
    const contentType = response.headers.get("content-type") ?? "";
    expect(contentType).toContain("application/linkset+json");
    expect(contentType).toContain("rfc9727");
    // RFC 9727 section 2: the catalog answers with its own api-catalog Link.
    expect(response.headers.get("link")).toBe(
        `<${ORIGIN}/.well-known/api-catalog>; rel="api-catalog"`,
    );

    const { linkset } = (await response.json()) as {
        linkset: Array<Record<string, Array<{ href: string; type: string }>>>;
    };
    expect(linkset).toHaveLength(1);
    expect(linkset[0].anchor).toBe(ORIGIN);
    expect(linkset[0]["service-desc"]).toEqual([
        { href: `${ORIGIN}/openapi.json`, type: "application/json" },
    ]);
    expect(linkset[0]["service-doc"]).toEqual([
        { href: `${ORIGIN}/llms.txt`, type: "text/plain" },
    ]);
});

test("advertises the agent entry points with Link headers on the root", async () => {
    const response = await SELF.fetch(`${ORIGIN}/`);
    expect(response.status).toBe(200);
    const link = response.headers.get("link") ?? "";
    expect(link).toContain('</openapi.json>; rel="service-desc"');
    expect(link).toContain('</llms.txt>; rel="service-doc"');
    expect(link).toContain('</.well-known/api-catalog>; rel="api-catalog"');

    const body = (await response.json()) as {
        endpoints: Record<string, string>;
    };
    expect(body.endpoints.agentEntryPoint).toContain("GET /llms.txt");
});

test("keeps the discovery documents on the serving origin", async () => {
    // media.myceli.ai is a second production route (wrangler.toml), so a
    // hardcoded origin would send agents to the wrong host from there.
    const alt = "https://media.myceli.ai";
    const llms = await SELF.fetch(`${alt}/llms.txt`);
    expect(await llms.text()).toContain(`${alt}/openapi.json`);

    const catalog = await SELF.fetch(`${alt}/.well-known/api-catalog`);
    const { linkset } = (await catalog.json()) as {
        linkset: Array<Record<string, Array<{ href: string }>>>;
    };
    expect(linkset[0].anchor).toBe(alt);
    expect(linkset[0]["service-doc"][0].href).toBe(`${alt}/llms.txt`);
});

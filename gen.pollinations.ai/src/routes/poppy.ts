// Personal Agent Protocol (Poppy), draft 0.2: a company advertises itself with
// one document at /.well-known/poppy.json so a personal agent can find its
// sign-in, its APIs and its website (https://personalagentprotocol.org).
//
// Discovery only. Sessions, DPoP and conversations are not implemented here, so
// the document advertises no endpoint that would fail: no agent.protocols, no
// feedback, and web points at the docs rather than a browser session endpoint.
export const POPPY_DOCUMENT = (origin: string) => {
    const issuer = origin.replace(
        "gen.pollinations.ai",
        "enter.pollinations.ai",
    );
    return {
        protocol_version: "0.2",
        organization: {
            name: "Pollinations",
            // Must be the host that serves this document (spec 3.1).
            domain: new URL(origin).hostname,
        },
        auth: {
            // The issuer identifies the company; its RFC 8414 metadata lists
            // this domain in poppy_domains, the other half of the two-way
            // check in spec 3.2.
            issuer,
            direct: { scopes: ["poppy:read"] },
            device: { scopes: ["poppy:read"] },
            custom_scopes: {
                "poppy:read": "Read the account profile and balance",
            },
        },
        apis: [
            {
                type: "openapi",
                url: `${origin}/openapi.json`,
                description:
                    "Generate text, images, audio and video, and read model and account data",
            },
            {
                type: "mcp",
                url: `${origin}/mcp/pollinations`,
                description:
                    "Hosted MCP server: discover models, generate media, read balance",
            },
        ],
        web: {
            browser_session_endpoint: `${origin}/docs`,
        },
    };
};

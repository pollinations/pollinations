import { z } from "zod";

// Ports that a scheme implies when the URL does not name one. The WHATWG parser already
// drops an explicit default port, so the effective port has to be put back to be useful:
// "https://example.com/" and "https://example.com:443/" are the same endpoint, and an agent
// comparing them needs one answer.
const DEFAULT_PORTS = {
    http: 80,
    https: 443,
    ws: 80,
    wss: 443,
    ftp: 21,
    ftps: 990,
};

function parseQuery(search) {
    const query = {};
    // A key may appear more than once, and "a=1&a=2" is not the same as "a=2", so every value
    // is kept. URLSearchParams also decodes for us, which is what makes "q=a%20b" readable.
    for (const [key, value] of new URLSearchParams(search)) {
        if (query[key] === undefined) query[key] = [];
        query[key].push(value);
    }
    return query;
}

export const urlTools = [
    [
        "url_parse",
        "Split a URL into its parts: scheme, host, effective port, path, query parameters and fragment. The host is the hostname without the port and without the brackets that delimit an IPv6 literal, every query value is decoded and repeated keys are kept as an array. The port is the effective one, so https without a port reports 443 the same way an explicit :443 does. A relative reference is resolved against the base when one is given, and otherwise refused. Credentials, when a URL carries them, are not returned. Use this instead of pattern-matching a URL by hand.",
        {
            url: z
                .string()
                .min(1)
                .max(2048)
                .describe(
                    'The URL to split, absolute or relative, such as "https://user@[::1]:8443/a/b?q=x%20y&q=z#top".',
                ),
            base: z
                .string()
                .max(2048)
                .optional()
                .describe(
                    'Absolute URL to resolve a relative url against, such as "https://example.com/dir/".',
                ),
        },
        ({ url, base }) => {
            let parsed;
            try {
                parsed = base === undefined ? new URL(url) : new URL(url, base);
            } catch {
                throw new Error(
                    base === undefined
                        ? `${JSON.stringify(url)} is not an absolute URL, and no base was given to resolve it against.`
                        : `${JSON.stringify(url)} cannot be resolved against ${JSON.stringify(base)}.`,
                );
            }

            const scheme = parsed.protocol.replace(/:$/, "");
            const explicitPort =
                parsed.port === "" ? null : Number(parsed.port);
            return {
                // A relative reference only becomes absolute once a base resolves it, and the
                // caller benefits from knowing which happened.
                absolute: base === undefined,
                scheme,
                // WHATWG keeps the brackets on an IPv6 hostname; they delimit the literal
                // rather than being part of the address, so they come off here.
                host: parsed.hostname.replace(/^\[(.*)\]$/, "$1"),
                port: explicitPort ?? DEFAULT_PORTS[scheme] ?? null,
                path: parsed.pathname,
                query: parseQuery(parsed.search),
                fragment: parsed.hash.replace(/^#/, ""),
            };
        },
    ],
];

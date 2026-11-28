import { z } from "zod";

export const urlTools = [
    [
        "inspect_url",
        "Parse and normalize a URL locally without making network requests. Extracts origin, protocol, punycode hostname, port, path, query parameters, and optionally resolves a relative path or updates query parameters.",
        {
            url: z.string().min(1).max(4096).describe("URL to inspect"),
            resolve: z
                .string()
                .max(2048)
                .optional()
                .describe("Optional relative URL to resolve against the base URL"),
            set_params: z
                .record(z.string(), z.string())
                .optional()
                .describe("Optional query parameters to set or overwrite"),
            remove_params: z
                .array(z.string())
                .max(50)
                .optional()
                .describe("Optional query parameter names to remove"),
        },
        ({ url, resolve, set_params, remove_params }) => {
            let parsed;
            try {
                parsed = resolve ? new URL(resolve, url) : new URL(url);
            } catch {
                throw new Error(`Invalid URL: ${url}`);
            }

            if (remove_params) {
                for (const key of remove_params) {
                    parsed.searchParams.delete(key);
                }
            }
            if (set_params) {
                for (const [key, value] of Object.entries(set_params)) {
                    parsed.searchParams.set(key, value);
                }
            }

            const params = {};
            for (const key of new Set(parsed.searchParams.keys())) {
                const values = parsed.searchParams.getAll(key);
                params[key] = values.length === 1 ? values[0] : values;
            }

            return {
                href: parsed.href,
                origin: parsed.origin,
                protocol: parsed.protocol,
                hostname: parsed.hostname,
                port: parsed.port || null,
                pathname: parsed.pathname,
                search: parsed.search || null,
                hash: parsed.hash || null,
                has_credentials: Boolean(parsed.username || parsed.password),
                query_params: params,
            };
        },
    ],
];

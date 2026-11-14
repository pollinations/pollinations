import { z } from "zod";
import { readText } from "./dns.js";

export async function lookupCtSubdomains(
    domainInput,
    limit = 50,
    offset = 0,
    filter,
) {
    const domain = domainInput.trim().toLowerCase().replace(/\.$/, "");
    if (
        !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
            domain,
        )
    ) {
        throw new Error(
            "Use a plain ASCII/punycode domain name without a scheme or path.",
        );
    }

    const url = new URL(
        `/api/v1/domain/${encodeURIComponent(domain)}`,
        "https://crt.live",
    );
    url.searchParams.set("sort", "recent");
    url.searchParams.set("limit", String(limit));
    if (offset) url.searchParams.set("offset", String(offset));
    if (filter) url.searchParams.set("filter", filter);

    const response = await fetch(url, {
        headers: { Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        const retryAfter = response.headers.get("retry-after");
        await response.body?.cancel();
        throw new Error(
            `Certificate transparency lookup returned HTTP ${response.status}${retryAfter ? `; retry after ${retryAfter}` : ""}`,
        );
    }

    const { text, truncated } = await readText(response, 512 * 1024);
    if (truncated)
        throw new Error("Certificate transparency response exceeds 512 KiB");

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("Certificate transparency service returned invalid JSON");
    }
    if (!data || typeof data !== "object" || !Array.isArray(data.names)) {
        throw new Error(
            "Certificate transparency service returned an invalid response",
        );
    }

    const names = data.names.map((entry) => {
        if (
            !entry ||
            typeof entry.name !== "string" ||
            typeof entry.first_seen !== "string"
        ) {
            throw new Error(
                "Certificate transparency service returned an invalid hostname entry",
            );
        }
        return { name: entry.name, first_seen: entry.first_seen };
    });

    return {
        domain: typeof data.apex === "string" ? data.apex : domain,
        count: Number.isInteger(data.count) ? data.count : names.length,
        total: Number.isInteger(data.total) ? data.total : null,
        total_capped: data.total_capped === true,
        names,
        has_more: data.has_more === true,
        next_offset:
            Number.isInteger(data.next_offset) && data.next_offset >= 0
                ? data.next_offset
                : null,
    };
}

export const ctTools = [
    [
        "ct_subdomains",
        "List hostnames seen in public Certificate Transparency logs under a domain, newest first. first_seen is a date, not a timestamp. A CT observation does not prove a hostname is active. Uses crt.live; no caller credentials are sent. Respect 429 Retry-After responses.",
        {
            domain: z
                .string()
                .trim()
                .min(1)
                .max(254)
                .describe(
                    "Plain domain name, for example example.com; IDNs must be supplied as ASCII/punycode",
                ),
            limit: z.number().int().min(1).max(100).default(50),
            offset: z.number().int().min(0).max(1000000).default(0),
            filter: z
                .string()
                .trim()
                .min(1)
                .max(63)
                .optional()
                .describe("Optional substring to match within subdomain names"),
        },
        ({ domain, limit, offset, filter }) =>
            lookupCtSubdomains(domain, limit, offset, filter),
    ],
];

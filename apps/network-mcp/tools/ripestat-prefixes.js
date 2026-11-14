import { z } from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

// RIPEstat announced-prefixes: the prefixes an autonomous system number
// currently announces. No key. The raw response is ~160 KB for a large ASN
// (1,441 prefixes for AS15169), so the tool summarizes it — counts plus the
// first 20 prefixes — instead of returning it whole. as-overview
// (tools/ripestat.js, open PR #19730) does not return prefixes at all, so
// this is its complement, not a duplicate.
const MAX_RESPONSE_BYTES = 1024 * 1024;

async function lookup(asn) {
    const url = `https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS${asn}`;
    const response = await fetch(url, {
        headers: {
            Accept: "application/json",
            "User-Agent": "Pollinations-Network/0.1 (hello@pollinations.ai)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
    });
    try {
        if (!response.ok)
            throw new Error(`RIPEstat returned HTTP ${response.status}`);
        const body = JSON.parse(
            await readResponseText(
                response,
                MAX_RESPONSE_BYTES,
                () => new Error("RIPEstat response exceeds 1 MiB"),
            ),
        );
        if (body.status !== "ok")
            throw new Error(
                `RIPEstat error: ${
                    (body.messages ?? [])
                        .map((m) => m[1] ?? m[0])
                        .filter(Boolean)
                        .join("; ") || body.status
                }`,
            );
        return body.data;
    } finally {
        await response.body?.cancel();
    }
}

function summarize(prefix) {
    const timelines = prefix.timelines ?? [];
    const starts = timelines.map((t) => t.starttime).filter(Boolean);
    const ends = timelines.map((t) => t.endtime).filter(Boolean);
    return {
        prefix: prefix.prefix,
        first_seen: starts.length ? starts.sort()[0] : null,
        last_seen: ends.length ? ends.sort().at(-1) : null,
    };
}

export const ripestatPrefixesTools = [
    [
        "announced_prefixes",
        "List the prefixes an autonomous system number announces, from RIPEstat. Returns the total count, the IPv4/IPv6 split and the first 20 prefixes with the dates each was first and last seen; the full list is too large to return whole. No caller credentials are sent.",
        { asn: z.string().trim().min(1).max(10) },
        async ({ asn }) => {
            const digits = asn.replace(/^as/i, "");
            if (!/^\d+$/.test(digits) || Number(digits) > 4294967295)
                throw new Error(
                    "Use an autonomous system number like '15169' or 'AS15169' (0-4294967295).",
                );
            const d = await lookup(Number(digits));
            const prefixes = d.prefixes ?? [];
            const shown = prefixes.slice(0, 20).map(summarize);
            return {
                asn: Number(d.resource),
                total_prefixes: prefixes.length,
                ipv4_prefixes: prefixes.filter((p) => p.prefix.includes("."))
                    .length,
                ipv6_prefixes: prefixes.filter((p) => p.prefix.includes(":"))
                    .length,
                query_starttime: d.query_starttime ?? null,
                query_endtime: d.query_endtime ?? null,
                prefixes: shown,
                prefixes_returned: shown.length,
                prefixes_truncated: prefixes.length > shown.length,
            };
        },
    ],
];

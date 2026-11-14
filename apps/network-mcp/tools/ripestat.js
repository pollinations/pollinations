import { z } from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

// RIPEstat as-overview: holder, announcement state and registry block for an
// autonomous system number. No key; the endpoint answers in ~1 s at ~650 B.
// The whois endpoint is deliberately not used — it takes ~6 s per call.
async function lookup(asn) {
    const url = `https://stat.ripe.net/data/as-overview/data.json?resource=AS${asn}`;
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
                65536,
                () => new Error("RIPEstat response exceeds 64 KiB"),
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

export const ripestatTools = [
    [
        "as_overview",
        "Read the holder, announcement state and registry block for an autonomous system number from RIPEstat. Unallocated numbers return an empty holder with announced false instead of an error. No caller credentials are sent.",
        { asn: z.string().trim().min(1).max(10) },
        async ({ asn }) => {
            const digits = asn.replace(/^as/i, "");
            if (!/^\d+$/.test(digits) || Number(digits) > 4294967295)
                throw new Error(
                    "Use an autonomous system number like '15169' or 'AS15169' (0-4294967295).",
                );
            const d = await lookup(Number(digits));
            return {
                asn: Number(d.resource),
                holder: d.holder || null,
                announced: d.announced,
                block: d.block
                    ? {
                          range: d.block.resource ?? null,
                          description: d.block.desc ?? null,
                          registry: d.block.name ?? null,
                      }
                    : null,
            };
        },
    ],
];

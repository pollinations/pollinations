import { z } from "zod";

// Cloudflare JSON DoH contract and result preservation from guus6457 (#17697).
export async function lookup(name, type, signal = AbortSignal.timeout(10000)) {
    const url = new URL("https://cloudflare-dns.com/dns-query");
    url.searchParams.set("name", name);
    url.searchParams.set("type", type.toUpperCase());
    const response = await fetch(url, {
        headers: { Accept: "application/dns-json" },
        redirect: "manual",
        signal,
    });
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`DNS resolver returned HTTP ${response.status}`);
    }
    const { text, truncated } = await readText(response, 65536);
    if (truncated) throw new Error("DNS response exceeds 64 KiB");
    return JSON.parse(text);
}

// Read a bounded prefix even when Content-Length is absent or compressed.
export async function readText(response, maxBytes) {
    if (!response.body) return { text: "", truncated: false };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "",
        bytes = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                return { text: text + decoder.decode(), truncated: false };
            const remaining = maxBytes - bytes;
            text += decoder.decode(value.subarray(0, remaining), {
                stream: true,
            });
            bytes += value.length;
            if (bytes > maxBytes)
                return { text: text + decoder.decode(), truncated: true };
        }
    } finally {
        await reader.cancel();
    }
}

export const dnsTools = [
    [
        "dns_lookup",
        "Look up DNS records through Cloudflare's public resolver. Returns its JSON unchanged: Status 0 is NOERROR, 2 SERVFAIL, 3 NXDOMAIN. A cached resolver view, not a propagation or safety check. No caller credentials are sent.",
        {
            name: z
                .string()
                .trim()
                .min(1)
                .max(254)
                .regex(/^(?:[a-zA-Z0-9_*-]{1,63}\.)*[a-zA-Z0-9_*-]{1,63}\.?$/)
                .describe(
                    "DNS name in ASCII/punycode; underscores for TXT/SRV records are supported",
                ),
            type: z
                .union([
                    z
                        .string()
                        .trim()
                        .min(1)
                        .max(16)
                        .regex(/^(?:[a-zA-Z][a-zA-Z0-9-]*|\d{1,5})$/)
                        .refine(
                            (s) => !/^\d+$/.test(s) || Number(s) <= 65535,
                            "DNS type must be at most 65535",
                        ),
                    z.number().int().min(0).max(65535),
                ])
                .default("A"),
        },
        ({ name, type }) => lookup(name, String(type)),
    ],
];

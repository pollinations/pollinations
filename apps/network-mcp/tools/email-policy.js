import { z } from "zod";
import { lookup } from "./dns.js";

// A TXT answer arrives as one or more quoted strings, and a record longer than 255 bytes
// is split into several of them inside a single `data` value. The quotes are the resolver's
// framing, not part of the record, so they are removed and the pieces are joined with
// nothing between them, which is what the sender's DNS server published.
function txtRecords(answer) {
    const records = [];
    for (const entry of answer?.Answer ?? []) {
        if (entry.type !== 16 || typeof entry.data !== "string") continue;
        const pieces = entry.data.match(/"((?:[^"\\]|\\.)*)"/g);
        if (pieces)
            records.push(pieces.map((piece) => piece.slice(1, -1)).join(""));
        else records.push(entry.data);
    }
    return records;
}

const SPF_PREFIX = /^v=spf1(?:\s|$)/i;
const DMARC_PREFIX = /^v=DMARC1(?:\s|;|$)/i;

// Mechanisms and modifiers whose evaluation costs a DNS lookup, per RFC 7208 section
// 4.6.4. ip4, ip6 and all are decided from the record itself. exp is only fetched when
// the message fails, so it is not counted either.
const LOOKUP_TERMS = new Set([
    "include",
    "a",
    "mx",
    "ptr",
    "exists",
    "redirect",
]);
const SPF_LOOKUP_LIMIT = 10;

function parseSpf(record) {
    const terms = record.trim().split(/\s+/).slice(1);
    const mechanisms = [];
    let lookups = 0;
    const modifiers = {};
    for (const term of terms) {
        const qualifier = "+-~?".includes(term[0]) ? term[0] : "+";
        const body = "+-~?".includes(term[0]) ? term.slice(1) : term;
        const [rawName] = body.split(/[:=/]/, 1);
        const name = rawName.toLowerCase();
        if (body.includes("=") && !body.includes(":")) {
            const [key, ...rest] = body.split("=");
            modifiers[key.toLowerCase()] = rest.join("=");
            if (key.toLowerCase() === "redirect") lookups += 1;
            continue;
        }
        const counts = LOOKUP_TERMS.has(name);
        if (counts) lookups += 1;
        mechanisms.push({
            term: body,
            qualifier,
            dnsLookup: counts,
        });
    }
    return {
        record,
        mechanisms,
        modifiers,
        dnsLookups: lookups,
        lookupLimit: SPF_LOOKUP_LIMIT,
        // Exceeding the limit is a permanent error for the receiver, so a record can be
        // syntactically fine and still fail every message.
        withinLookupLimit: lookups <= SPF_LOOKUP_LIMIT,
    };
}

function parseDmarc(record) {
    const tags = {};
    for (const part of record.split(";")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const separator = trimmed.indexOf("=");
        if (separator < 0) continue;
        tags[trimmed.slice(0, separator).trim().toLowerCase()] = trimmed
            .slice(separator + 1)
            .trim();
    }
    return {
        record,
        tags,
        // A record without p= is invalid and is treated as no policy at all.
        policy: tags.p ?? null,
        subdomainPolicy: tags.sp ?? null,
    };
}

function pick(records, pattern) {
    const matching = records.filter((record) => pattern.test(record));
    // More than one record of a kind is itself a misconfiguration: receivers treat
    // several SPF records as a permanent error, because the result is undefined.
    return { matching, multiple: matching.length > 1 };
}

export const emailPolicyTools = [
    [
        "email_policy_records",
        "Read and parse the SPF and DMARC records a domain publishes for its email, over Cloudflare's public resolver. Both records are returned as structured terms rather than raw TXT text: SPF mechanisms with their qualifier and whether each costs a DNS lookup, counted against the ten-lookup ceiling that receivers enforce, and DMARC tags with the resulting policy. Reports when a record is absent, and when a domain publishes more than one of a kind, which receivers treat as a permanent error. DKIM is left out because it needs a selector only the sender knows. No caller credentials are sent.",
        {
            domain: z
                .string()
                .trim()
                .min(1)
                .max(253)
                .regex(
                    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/,
                )
                .describe(
                    "The domain whose email policy to read, for example example.com. ASCII or punycode, no scheme, path or trailing dot.",
                ),
        },
        async ({ domain }) => {
            const name = domain.toLowerCase();
            const [spfAnswer, dmarcAnswer] = await Promise.all([
                lookup(name, "TXT"),
                lookup(`_dmarc.${name}`, "TXT"),
            ]);
            const spf = pick(txtRecords(spfAnswer), SPF_PREFIX);
            const dmarc = pick(txtRecords(dmarcAnswer), DMARC_PREFIX);
            return {
                domain: name,
                spf: spf.matching.length
                    ? {
                          ...parseSpf(spf.matching[0]),
                          multipleRecords: spf.multiple,
                          recordsPublished: spf.matching.length,
                      }
                    : null,
                dmarc: dmarc.matching.length
                    ? {
                          ...parseDmarc(dmarc.matching[0]),
                          multipleRecords: dmarc.multiple,
                          recordsPublished: dmarc.matching.length,
                      }
                    : null,
            };
        },
    ],
];

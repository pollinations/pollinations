import { z } from "zod";
import { lookup } from "./dns.js";

const DNS_STATUS = {
    0: "NOERROR",
    1: "FORMERR",
    2: "SERVFAIL",
    3: "NXDOMAIN",
    4: "NOTIMP",
    5: "REFUSED",
};

function statusOf(response) {
    const code = Number.isInteger(response?.Status) ? response.Status : null;
    return { code, name: DNS_STATUS[code] ?? "UNKNOWN" };
}

function answerRecords(response, type) {
    return (response?.Answer ?? []).filter((record) => record.type === type);
}

// DNS TXT data may contain several quoted character-strings that form one value.
function txtValue(data) {
    const parts = [...String(data).matchAll(/"((?:\\.|[^"\\])*)"/g)];
    return parts.length
        ? parts.map((part) => part[1].replace(/\\(["\\])/g, "$1")).join("")
        : String(data).trim().replace(/^"|"$/g, "");
}

function txtRecords(response) {
    return answerRecords(response, 16)
        .map((record) => txtValue(record.data ?? ""))
        .filter(Boolean);
}

function parseMx(response) {
    return answerRecords(response, 15).map(({ data }) => {
        const raw = String(data ?? "").trim();
        const match = raw.match(/^(\d+)\s+(.+)$/);
        return match
            ? {
                  priority: Number(match[1]),
                  exchange: match[2] === "." ? "." : match[2].replace(/\.$/, "").toLowerCase(),
              }
            : { priority: null, exchange: null, raw };
    });
}

function parseDmarc(record) {
    const tags = Object.fromEntries(
        record
            .split(";")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
                const separator = part.indexOf("=");
                return separator < 0
                    ? [part.toLowerCase(), ""]
                    : [
                          part.slice(0, separator).trim().toLowerCase(),
                          part.slice(separator + 1).trim(),
                      ];
            }),
    );
    const policy = tags.p?.toLowerCase() ?? null;
    return {
        valid:
            tags.v?.toLowerCase() === "dmarc1" &&
            ["none", "quarantine", "reject"].includes(policy),
        policy,
        rua: tags.rua
            ? tags.rua.split(",").map((value) => value.trim()).filter(Boolean)
            : [],
        ruf: tags.ruf
            ? tags.ruf.split(",").map((value) => value.trim()).filter(Boolean)
            : [],
    };
}

function finding(findings, code, severity, message) {
    findings.push({ code, severity, message });
}

async function queryDns(name, type) {
    try {
        return { response: await lookup(name, type), error: null };
    } catch (error) {
        return {
            response: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function inspectEmailDomain(input) {
    const domain = input.trim().toLowerCase().replace(/\.$/, "");
    if (
        !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
            domain,
        )
    ) {
        throw new Error(
            "Use a plain ASCII/punycode domain name without a scheme or path.",
        );
    }

    const [mxQuery, spfQuery, dmarcQuery] = await Promise.all([
        queryDns(domain, "MX"),
        queryDns(domain, "TXT"),
        queryDns("_dmarc." + domain, "TXT"),
    ]);
    const mxDns = statusOf(mxQuery.response);
    const spfDns = statusOf(spfQuery.response);
    const dmarcDns = statusOf(dmarcQuery.response);
    const mxRecords = parseMx(mxQuery.response);
    const allTxt = txtRecords(spfQuery.response);
    const spfRecords = allTxt.filter((record) =>
        /^v=spf1(?:\s|$)/i.test(record),
    );
    const dmarcRecords = txtRecords(dmarcQuery.response).filter((record) =>
        /^v=dmarc1(?:\s*;|$)/i.test(record),
    );
    const dmarc = dmarcRecords.length === 1 ? parseDmarc(dmarcRecords[0]) : null;
    const findings = [];
    const domainMissing = mxDns.code === 3;
    const nullMx = mxRecords.length === 1 && mxRecords[0].priority === 0 && mxRecords[0].exchange === ".";

    if (mxQuery.error || ![0, 3].includes(mxDns.code)) {
        finding(
            findings,
            "mx_lookup_failed",
            "error",
            "The MX DNS lookup did not complete successfully.",
        );
    } else if (domainMissing) {
        finding(
            findings,
            "domain_not_found",
            "error",
            "The domain returned NXDOMAIN for its MX lookup.",
        );
    } else if (nullMx) {
        finding(
            findings,
            "null_mx",
            "info",
            "The domain publishes an RFC 7505 null MX (0 .) and explicitly does not accept email.",
        );
    } else if (mxRecords.length === 0) {
        finding(
            findings,
            "no_explicit_mx_records",
            "info",
            "No explicit MX records were returned. SMTP may use implicit MX when the domain has an address record.",
        );
    }

    let spfStatus;
    if (spfQuery.error || ![0, 3].includes(spfDns.code)) {
        spfStatus = "lookup_failed";
        finding(
            findings,
            "spf_lookup_failed",
            "warning",
            "The TXT lookup for SPF did not complete successfully.",
        );
    } else if (domainMissing) {
        spfStatus = "domain_not_found";
    } else if (spfRecords.length === 0) {
        spfStatus = "missing";
        finding(
            findings,
            "missing_spf_record",
            "warning",
            "No SPF TXT record was found at the domain root.",
        );
    } else if (spfRecords.length > 1) {
        spfStatus = "multiple";
        finding(
            findings,
            "multiple_spf_records",
            "error",
            "Multiple SPF records were found; receivers can treat this as SPF PermError.",
        );
    } else {
        spfStatus = "present";
    }

    let dmarcStatus;
    let dmarcDetails = { policy: null, rua: [], ruf: [] };
    if (dmarcQuery.error || ![0, 3].includes(dmarcDns.code)) {
        dmarcStatus = "lookup_failed";
        finding(
            findings,
            "dmarc_lookup_failed",
            "warning",
            "The TXT lookup at _dmarc did not complete successfully.",
        );
    } else if (domainMissing) {
        dmarcStatus = "domain_not_found";
    } else if (dmarcRecords.length === 0) {
        dmarcStatus = "missing";
        finding(
            findings,
            "missing_dmarc_record",
            "warning",
            "No DMARC TXT record was found at _dmarc.",
        );
    } else if (dmarcRecords.length > 1) {
        dmarcStatus = "multiple";
        finding(
            findings,
            "multiple_dmarc_records",
            "error",
            "Multiple DMARC records were found at _dmarc.",
        );
    } else if (!dmarc.valid) {
        dmarcStatus = "invalid";
        dmarcDetails = dmarc;
        finding(
            findings,
            "invalid_dmarc_record",
            "warning",
            "The DMARC record is missing a valid v=DMARC1 or p= policy tag.",
        );
    } else {
        dmarcStatus = "valid";
        dmarcDetails = dmarc;
    }

    const queryInfo = (query, status) => ({
        status: status.name,
        statusCode: status.code,
        ...(query.error ? { error: query.error } : {}),
    });
    return {
        domain,
        mx: {
            dns: queryInfo(mxQuery, mxDns),
            null_mx: nullMx,
            records: mxRecords.sort(
                (a, b) =>
                    (a.priority ?? Infinity) - (b.priority ?? Infinity) ||
                    String(a.exchange).localeCompare(String(b.exchange)),
            ),
        },
        spf: {
            dns: queryInfo(spfQuery, spfDns),
            status: spfStatus,
            records: spfRecords,
        },
        dmarc: {
            dns: queryInfo(dmarcQuery, dmarcDns),
            status: dmarcStatus,
            records: dmarcRecords,
            policy: dmarcDetails.policy,
            rua: dmarcDetails.rua,
            ruf: dmarcDetails.ruf,
        },
        findings,
    };
}

export const emailTools = [
    [
        "email_domain_check",
        "Inspect a domain's public MX, SPF and DMARC DNS records. Returns the observed records and basic configuration findings; it is a DNS snapshot, not an email-deliverability, DKIM, or full SPF/DMARC compliance audit. No caller credentials are sent.",
        {
            domain: z
                .string()
                .trim()
                .min(1)
                .max(254)
                .describe(
                    "Plain domain name, for example example.com; IDNs must be supplied as ASCII/punycode",
                ),
        },
        ({ domain }) => inspectEmailDomain(domain),
    ],
];

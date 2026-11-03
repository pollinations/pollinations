// The checker every agent's answer passes through: a claim counts only when it
// cites evidence the agent actually had, an id from its context or a URL it
// fetched. Text that reaches a public post is cleaned here once.
const STATUSES = new Set([
    "supported",
    "contradicted",
    "unverified",
    "not_applicable",
]);

export const redact = (value) =>
    String(value ?? "").replace(
        /\b(?:plln_)?sk_[A-Za-z0-9_-]{8,}/g,
        "sk_[redacted]",
    );

// No links of any kind, no mentions, no HTML, and Markdown punctuation (table
// pipes included) escaped so it shows as plain text.
export const cleanLine = (value, max = 200) =>
    redact(value)
        .replace(
            /\b[a-z][a-z0-9+.-]*:\/\/\S+|\/\/\S+|\bwww\.\S+/gi,
            "(link omitted)",
        )
        .replace(/@/g, "@​")
        .replace(/[<>]/g, "")
        .replace(/\p{Cc}/gu, " ")
        .replace(/[\\`*_[\]()#!~|]/g, "\\$&")
        .trim()
        .slice(0, max);

export function parseReport(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("the agent returned no JSON");
    const report = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(report.findings))
        throw new Error("the agent returned no findings");
    return report;
}

const sameUrl = (a, b) => a.replace(/\/$/, "") === b.replace(/\/$/, "");
const list = (value) => (Array.isArray(value) ? value : []);

export function checkReport(report, { ids, fetched, requirements, optional }) {
    const cited = (item) =>
        ids.has(item) ||
        (typeof item === "string" && fetched.some((url) => sameUrl(url, item)));
    const findings = requirements.map((requirement) => {
        const raw = report.findings.find((f) => f?.requirement === requirement);
        if (!raw)
            return {
                requirement,
                status: "unverified",
                evidence: [],
                note: "Not assessed.",
            };
        const evidence = list(raw.evidence).filter(cited);
        let status = STATUSES.has(raw.status) ? raw.status : "unverified";
        if (status === "not_applicable" && !optional.includes(requirement))
            status = "unverified";
        if (
            (status === "supported" || status === "contradicted") &&
            !evidence.length
        )
            status = "unverified";
        return {
            requirement,
            status,
            evidence,
            note: cleanLine(raw.note, 300),
        };
    });
    const contradicted = findings.some((f) => f.status === "contradicted");
    return {
        contradicted,
        findings,
        questions: contradicted
            ? list(report.questions)
                  .map((q) => cleanLine(q))
                  .filter(Boolean)
                  .slice(0, 4)
            : [],
        couldNotCheck: list(report.couldNotCheck)
            .map((c) => cleanLine(c, 300))
            .filter(Boolean)
            .slice(0, 6),
    };
}

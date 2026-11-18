// CIRCL CVE lookup (cve.circl.lu) — public, keyless, no key forwarded.
// The API serves CVE 5.1 JSON records. Unknown ids answer HTTP 200 with
// an empty object, so a missing cveMetadata is treated as "not found" here.
import { z } from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

const API_ROOT = "https://cve.circl.lu/api/cve";
const CVE_ID = /^CVE-\d{4}-\d{4,}$/i;
const DESCRIPTION_CAP = 1000;

function englishDescription(descriptions) {
    const list = Array.isArray(descriptions) ? descriptions : [];
    const entry =
        list.find((d) => d?.lang === "en" && typeof d?.value === "string") ??
        list.find((d) => typeof d?.value === "string");
    return entry?.value ?? null;
}

function cvssScore(metrics) {
    for (const entry of Array.isArray(metrics) ? metrics : []) {
        for (const key of ["cvssV4_0", "cvssV3_1", "cvssV3_0"]) {
            const value = entry?.[key];
            if (value && typeof value.baseScore === "number") {
                return {
                    version:
                        key === "cvssV4_0"
                            ? "4.0"
                            : key === "cvssV3_1"
                              ? "3.1"
                              : "3.0",
                    score: value.baseScore,
                    severity: value.baseSeverity ?? null,
                    vector: value.vectorString ?? null,
                };
            }
        }
    }
    return null;
}

// Some records carry no numeric CVSS — the CNA instead labels severity in an
// "other" metric (Log4Shell's CNA entry just says "critical"). Surface that
// short label so the result still says how bad the CVE is.
function otherSeverity(metrics) {
    for (const entry of Array.isArray(metrics) ? metrics : []) {
        const label =
            entry?.other?.content?.other ?? entry?.other?.content?.value;
        if (
            typeof label === "string" &&
            /^(critical|high|medium|low|none)$/i.test(label.trim())
        )
            return label.trim().toLowerCase();
    }
    return null;
}

function cweIds(problemTypes) {
    return (Array.isArray(problemTypes) ? problemTypes : [])
        .flatMap((p) => p?.descriptions ?? [])
        .map((d) => d?.cweId)
        .filter(Boolean);
}

async function lookupCve(cveId) {
    const response = await fetch(`${API_ROOT}/${encodeURIComponent(cveId)}`, {
        headers: {
            Accept: "application/json",
            "User-Agent": "Pollinations-Network/0.1 (hello@pollinations.ai)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
    });
    try {
        if (!response.ok)
            throw new Error(
                `CIRCL returned HTTP ${response.status}${response.headers.has("retry-after") ? `; retry after ${response.headers.get("retry-after")}` : ""}`,
            );
        const data = JSON.parse(
            await readResponseText(
                response,
                512 * 1024,
                () => new Error("CIRCL response exceeds 512 KiB"),
            ),
        );
        if (!data?.cveMetadata?.cveId)
            throw new Error(`No CVE record found for ${cveId}.`);
        const cna = data.containers?.cna ?? {};
        const description = englishDescription(cna.descriptions);
        const cvss = cvssScore(cna.metrics);
        return {
            cve_id: data.cveMetadata.cveId,
            state: data.cveMetadata.state ?? null,
            title: cna.title ?? null,
            description:
                description === null
                    ? null
                    : description.slice(0, DESCRIPTION_CAP),
            description_truncated:
                description !== null && description.length > DESCRIPTION_CAP,
            published: data.cveMetadata.datePublished ?? null,
            updated: data.cveMetadata.dateUpdated ?? null,
            cvss,
            severity:
                cvss?.severity?.toLowerCase() ?? otherSeverity(cna.metrics),
            cwes: cweIds(cna.problemTypes),
            affected: (Array.isArray(cna.affected) ? cna.affected : [])
                .map((a) => ({
                    vendor: a?.vendor ?? null,
                    product: a?.product ?? null,
                }))
                // Some records open with a version-only entry carrying
                // neither field; drop those instead of returning nulls.
                .filter((a) => a.vendor !== null || a.product !== null)
                .slice(0, 3),
            references_count: (cna.references ?? []).length,
            references: (Array.isArray(cna.references) ? cna.references : [])
                .slice(0, 3)
                .map((r) => r?.url)
                .filter(Boolean),
        };
    } finally {
        await response.body?.cancel();
    }
}

export const circlTools = [
    [
        "cve_lookup",
        "Look up one CVE vulnerability by id from CIRCL's public CVE database. Returns the title, description, CVSS score and severity when the record carries one, CWE ids, affected vendor/product and the first reference URLs. No key needed.",
        {
            cve_id: z.string().trim().min(1).max(20).regex(CVE_ID),
        },
        async ({ cve_id }) => {
            const id = String(cve_id).trim().toUpperCase();
            if (!CVE_ID.test(id))
                throw new Error(
                    "Use a CVE id like CVE-2021-44228 (CVE-YYYY-NNNNN).",
                );
            return lookupCve(id);
        },
    ],
];

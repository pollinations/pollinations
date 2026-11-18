import { z } from "zod";

const API_ROOT = "https://api.first.org/data/v1/epss";
const CVE_PATTERN = /^CVE-\d{4}-\d{4,7}$/i;

export const epssTools = [
    [
        "epss_score",
        "Get the EPSS exploit probability score for a CVE ID — the estimated probability that the vulnerability will be exploited in the wild in the next 30 days, from FIRST.org's Exploit Prediction Scoring System. Returns the score (0-1), its percentile rank among all scored CVEs, and the date the scores were published. This answers how likely exploitation is, not what the vulnerability is — for the CVE description, use a CVE lookup instead.",
        {
            cve: z
                .string()
                .min(1)
                .max(20)
                .describe("CVE identifier, e.g. CVE-2021-44228"),
        },
        async ({ cve }, fetchJson) => {
            const id = cve.trim().toUpperCase();
            if (!CVE_PATTERN.test(id))
                throw new Error("Use a CVE identifier like CVE-2021-44228.");
            const data = await fetchJson(
                `${API_ROOT}?cve=${encodeURIComponent(id)}`,
            );
            const record = data?.data?.[0];
            if (!record) throw new Error(`No EPSS score found for ${id}.`);
            return {
                cve: record.cve,
                epss: Number(record.epss),
                percentile: Number(record.percentile),
                date: record.date ?? null,
            };
        },
    ],
];

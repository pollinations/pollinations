import { z } from "zod";
import { fetchJson } from "../fetch.js";

// Preserve OSV records and pagination from Saauf's #17753.
export const osvTools = [
    [
        "osv_query",
        "Query known OSV vulnerabilities for a package version. Use OSV ecosystem names (npm, PyPI, crates.io, Go, Maven). Pass next_page_token as pageToken with the same query to continue. No findings is not proof of safety. Package identifiers are sent to OSV.",
        {
            ecosystem: z.string().trim().min(1).max(100),
            name: z.string().trim().min(1).max(500),
            version: z.string().trim().min(1).max(200),
            pageToken: z.string().min(1).max(4096).optional(),
        },
        ({ ecosystem, name, version, pageToken }) =>
            fetchJson("https://api.osv.dev/v1/query", {
                package: { ecosystem, name },
                version,
                page_token: pageToken,
            }),
    ],
    [
        "osv_vulnerability",
        "Read a full OSV advisory, including aliases, affected ranges, fix events and references. Assess reachability separately; records describe known vulnerabilities, not a complete security audit.",
        {
            id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),
        },
        ({ id }) =>
            fetchJson(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`),
    ],
];

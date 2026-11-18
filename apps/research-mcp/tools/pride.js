// PRIDE Archive (EMBL-EBI) proteomics datasets. No key needed.
// The API returns a bare JSON array of full project records; the long
// projectDescription is dropped on purpose — only accession and title
// are projected, so a call stays small.
import { z } from "zod";

const API_ROOT = "https://www.ebi.ac.uk/pride/ws/archive/v2";

function projectSummary(project) {
    return {
        accession: project.accession ?? null,
        title: project.title ?? null,
    };
}

export const prideTools = [
    [
        "pride_projects",
        "Search proteomics datasets in the PRIDE Archive (EMBL-EBI) by keyword. Returns project accessions and titles only — descriptions are long and are not returned. Same research family as ENA sequences, STRING interactions and ClinVar variants, different data.",
        {
            keyword: z
                .string()
                .min(1)
                .max(500)
                .describe(
                    "Keyword to search project titles and descriptions, for example cancer.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of projects to return (1-10)."),
        },
        async ({ keyword, limit }, fetchJson) => {
            const trimmed = typeof keyword === "string" ? keyword.trim() : "";
            if (!trimmed) throw new Error("A keyword is required.");
            const pageSize =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${API_ROOT}/search/projects?keyword=${encodeURIComponent(trimmed)}&pageSize=${pageSize}&page=0`;
            const data = await fetchJson(url);
            if (!Array.isArray(data))
                throw new Error("PRIDE returned an unexpected response.");
            return {
                keyword: trimmed,
                total: data.length,
                projects: data.map(projectSummary),
            };
        },
    ],
];

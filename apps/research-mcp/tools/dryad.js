import { z } from "zod";

const API_ROOT = "https://datadryad.org/api/v2/search";

function datasetSummary(dataset) {
    const authors = (dataset.authors ?? []).map((author) =>
        [author.firstName, author.lastName].filter(Boolean).join(" "),
    );
    return {
        doi: (dataset.identifier ?? "").replace(/^doi:/, "") || null,
        title: dataset.title ?? null,
        authors,
        publication_date: dataset.publicationDate ?? null,
    };
}

export const dryadTools = [
    [
        "dryad_search",
        "Search Dryad for open research datasets. Returns the DOI, title, authors, and publication date of matching datasets. Dryad is a curated repository of data underlying published research.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Search terms, for example climate change or rainforest birds.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of datasets to return."),
        },
        async ({ query, limit }, fetchJson) => {
            const trimmed = query.trim();
            if (!trimmed) throw new Error("Query must not be empty.");
            const safeLimit =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = new URL(API_ROOT);
            url.searchParams.set("q", trimmed);
            url.searchParams.set("per_page", String(safeLimit));
            const data = await fetchJson(url);
            const datasets = data?._embedded?.["stash:datasets"];
            if (!Array.isArray(datasets)) {
                throw new Error(
                    "Dryad returned an unexpected response; try again later.",
                );
            }
            return {
                query: trimmed,
                total: data.total ?? datasets.length,
                datasets: datasets.map(datasetSummary),
            };
        },
    ],
];

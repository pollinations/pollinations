import { z } from "zod";
import { fetchJson } from "../fetch.js";

// Humanitarian Data Exchange (HDX) dataset search via the CKAN package_search
// API. The payload is very verbose (~62 KB for 2 rows), so the projection
// below is load-bearing — most of each record is dropped.

function stripMarkdownLinks(text) {
    let out = "";
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "!" && text[i + 1] === "[") i++;
        if (text[i] === "[") {
            const close = text.indexOf("]", i);
            if (close !== -1 && text[close + 1] === "(") {
                const end = text.indexOf(")", close + 2);
                if (end !== -1) {
                    out += text.slice(i + 1, close);
                    i = end;
                    continue;
                }
            }
        }
        out += text[i];
    }
    return out;
}

function cleanSummary(notes) {
    const text = stripMarkdownLinks(String(notes ?? ""))
        .replace(/\s+/g, " ")
        .trim();
    if (text.length <= 500) return { summary: text || null, truncated: false };
    return { summary: text.slice(0, 500), truncated: true };
}

function datePart(value) {
    const text = String(value ?? "").trim();
    return text ? text.slice(0, 10) : null;
}

export const hdxTools = [
    [
        "hdx_datasets",
        "Search the Humanitarian Data Exchange (HDX) for humanitarian datasets by keyword. Returns matching datasets with title, publishing organisation, dataset date range, resource count and formats, licence, a short description and the dataset page URL. Total is the whole match count, not the number returned. No key needed.",
        {
            query: z.string().trim().min(1).max(200),
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ query, limit }, fetch = fetchJson) => {
            const term = String(query ?? "").trim();
            if (!term) throw new Error("query must not be blank.");
            const rows =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = new URL(
                "https://data.humdata.org/api/3/action/package_search",
            );
            url.search = new URLSearchParams({
                q: term,
                rows: String(rows),
            });
            const data = await fetch(url);
            if (!data?.success || !Array.isArray(data?.result?.results))
                throw new Error("Invalid HDX search response");
            return {
                query: term,
                total: data.result.count ?? data.result.results.length,
                datasets: data.result.results.map((d) => {
                    const formats = [];
                    for (const r of Array.isArray(d.resources)
                        ? d.resources
                        : []) {
                        const format = String(r?.format ?? "")
                            .trim()
                            .toUpperCase();
                        if (format && !formats.includes(format))
                            formats.push(format);
                    }
                    const { summary, truncated } = cleanSummary(d.notes);
                    return {
                        title: d.title ?? null,
                        name: d.name ?? null,
                        organization: d.organization?.title ?? null,
                        dataset_date: d.dataset_date ?? null,
                        updated: datePart(d.metadata_modified),
                        resources: d.num_resources ?? null,
                        formats: formats.slice(0, 10),
                        license: d.license_title ?? null,
                        summary,
                        truncated,
                        url: d.name
                            ? `https://data.humdata.org/dataset/${d.name}`
                            : null,
                    };
                }),
            };
        },
    ],
];

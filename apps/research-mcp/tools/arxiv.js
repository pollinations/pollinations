import { z } from "zod";
import { fetchText } from "../fetch.js";
import { decodeEntities } from "./europe-pmc.js";

// arXiv's public API is keyless and asks for at most one request every three
// seconds, so each tool call makes exactly one upstream request.
const API = "https://export.arxiv.org/api/query";
const ID = /^(?:\d{4}\.\d{4,5}|[a-z-]+\/\d{7})(?:v\d+)?$/;
const SORTS = {
    relevance: "relevance",
    submitted: "submittedDate",
    updated: "lastUpdatedDate",
};

const text = (xml, tag) => {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : null;
};

function parse(xml) {
    const papers = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(
        ([, entry]) => {
            const [, id, version] = text(entry, "id").match(
                /abs\/(.+?)(?:v(\d+))?$/,
            );
            return {
                id,
                version: version ? Number(version) : null,
                title: text(entry, "title"),
                authors: [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(
                    ([, name]) => decodeEntities(name).trim(),
                ),
                published: text(entry, "published"),
                updated: text(entry, "updated"),
                primary_category:
                    entry.match(
                        /<arxiv:primary_category term="([^"]+)"/,
                    )?.[1] ?? null,
                categories: [
                    ...entry.matchAll(/<category term="([^"]+)"/g),
                ].map(([, term]) => term),
                abstract: text(entry, "summary"),
                comment: text(entry, "arxiv:comment"),
                journal_ref: text(entry, "arxiv:journal_ref"),
                doi: text(entry, "arxiv:doi"),
                url: `https://arxiv.org/abs/${id}`,
                pdf_url: `https://arxiv.org/pdf/${id}`,
            };
        },
    );
    return { total: Number(text(xml, "opensearch:totalResults") ?? 0), papers };
}

const query = async (params) =>
    parse(
        await fetchText(
            `${API}?${new URLSearchParams(params)}`,
            "application/atom+xml",
        ),
    );

export const arxivTools = [
    [
        "arxiv_search",
        'Search arXiv preprints in physics, mathematics, computer science, biology, finance and statistics. Returns titles, authors, dates, categories and abstracts. Plain words match any field, so quote exact phrases with a field prefix, for example ti:"attention is all you need", ti:transformer AND cat:cs.CL or au:Hinton.',
        {
            query: z.string().trim().min(1).max(500),
            limit: z.number().int().min(1).max(50).default(10),
            sort: z
                .enum(["relevance", "submitted", "updated"])
                .default("relevance")
                .describe(
                    "Order by relevance, newest submission or newest update.",
                ),
        },
        async ({ query: q, limit, sort }) => {
            const { total, papers } = await query({
                search_query: q,
                max_results: limit,
                sortBy: SORTS[sort],
                sortOrder: "descending",
            });
            return { query: q, total, papers };
        },
    ],
    [
        "arxiv_paper",
        "Read one arXiv paper by ID: title, authors, abstract, categories, comment, journal reference and DOI. Omit the version to get the latest.",
        {
            id: z
                .string()
                .trim()
                .min(1)
                .max(64)
                .describe(
                    "arXiv ID, for example 1706.03762, 1706.03762v5 or hep-th/9901001.",
                ),
        },
        async ({ id }) => {
            const clean = id.replace(/^arxiv:/i, "");
            if (!ID.test(clean))
                throw new Error(
                    "Use an arXiv ID such as 1706.03762, 1706.03762v5 or hep-th/9901001.",
                );
            const [paper] = (await query({ id_list: clean })).papers;
            if (!paper) throw new Error(`No arXiv paper found for ${clean}.`);
            return paper;
        },
    ],
];

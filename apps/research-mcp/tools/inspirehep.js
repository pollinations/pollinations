import { z } from "zod";
import { fetchJson } from "../fetch.js";

// INSPIRE-HEP is the high-energy physics literature database (CERN). The
// public literature API needs no key. Two things keep responses small
// enough for the 512 KiB fetch cap: the `fields` parameter requests only
// the six fields the tool returns, and authors come back as bare names
// (`authors.full_name`) — a full author object with affiliations runs
// ~500 B each, and collaboration papers carry thousands of authors (a
// 2,886-author ATLAS paper is 109 KB for 5 results this way, versus
// 1.9 MB with full author objects).
const API = "https://inspirehep.net/api/literature";
const FIELDS =
    "titles,authors.full_name,arxiv_eprints,dois,publication_info,citation_count";
const MAX_AUTHORS = 5;

function project(hit) {
    const metadata = hit.metadata ?? {};
    const titles = metadata.titles ?? [];
    const authors = metadata.authors ?? [];
    const publication = (metadata.publication_info ?? [])[0] ?? {};
    const arxiv = (metadata.arxiv_eprints ?? [])[0] ?? {};
    const doi = (metadata.dois ?? [])[0] ?? {};
    return {
        title: titles[0]?.title ?? null,
        authors: authors.slice(0, MAX_AUTHORS).map((a) => a.full_name),
        author_count: authors.length,
        year: publication.year ?? null,
        journal: publication.journal_title ?? null,
        arxiv_id: arxiv.value ?? null,
        doi: doi.value ?? null,
        citation_count: metadata.citation_count ?? null,
        url: `https://inspirehep.net/literature/${metadata.control_number}`,
    };
}

export const inspirehepTools = [
    [
        "inspirehep_search",
        "Search INSPIRE-HEP, the high-energy physics literature database (CERN): journal papers and preprints in hep-th, hep-ph, hep-ex, gr-qc and related fields. Returns title, authors, year, journal, arXiv ID, DOI and citation count, newest first. Plain words match any field; the query language also supports fielded search, for example a:malda or a:atlas. High-energy physics only — for general science use crossref_search or europe-pmc.",
        {
            query: z.string().trim().min(1).max(500),
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ query, limit }) => {
            const data = await fetchJson(
                `${API}?${new URLSearchParams({
                    q: query,
                    size: String(limit),
                    sort: "mostrecent",
                    fields: FIELDS,
                })}`,
            );
            const hits = data?.hits?.hits ?? [];
            return {
                query,
                total: data?.hits?.total ?? 0,
                results: hits.map(project),
            };
        },
    ],
];

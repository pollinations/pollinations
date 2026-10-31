import { z } from "zod";
import { fetchJson, fetchText } from "../fetch.js";

const rfcNumber = z.number().int().min(1).max(99999);

function cleanList(items) {
    return Array.isArray(items)
        ? items.map((x) => String(x).trim()).filter(Boolean)
        : [];
}

export function extractSection(text, { section, startLine, maxLines = 120 }) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    if (section !== undefined) {
        const normalized = section.trim().replace(/\.$/, "");
        const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const headingPattern = new RegExp(
            `^(?:Section\\s+)?${escaped}(?:\\.|\\s)\\s*\\S`,
            "i",
        );
        const topLevelDepth = normalized.split(".").length;
        let matchIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (headingPattern.test(line) && !/\.{4,}\s*\d+\s*$/.test(line)) {
                matchIndex = i;
                break;
            }
        }
        if (matchIndex === -1)
            throw new Error(`Section ${normalized} not found in RFC text`);

        let endIndex = Math.min(lines.length, matchIndex + maxLines);
        for (let i = matchIndex + 1; i < endIndex; i++) {
            const m = lines[i].match(/^(\d+(?:\.\d+)*)\.?\s+\S/);
            if (
                m &&
                !/\.{4,}\s*\d+\s*$/.test(lines[i]) &&
                m[1].split(".").length <= topLevelDepth
            ) {
                endIndex = i;
                break;
            }
        }
        return {
            startLine: matchIndex + 1,
            endLine: endIndex,
            totalLines: lines.length,
            truncated: endIndex - matchIndex >= maxLines,
            content: lines.slice(matchIndex, endIndex).join("\n"),
        };
    }

    const start = Math.max(1, startLine ?? 1);
    if (start > lines.length)
        throw new Error(
            `startLine ${start} exceeds document length (${lines.length} lines)`,
        );
    const end = Math.min(lines.length, start - 1 + maxLines);
    return {
        startLine: start,
        endLine: end,
        totalLines: lines.length,
        truncated: end < lines.length,
        content: lines.slice(start - 1, end).join("\n"),
    };
}

export const rfcTools = [
    [
        "rfc_search",
        "Search published IETF RFCs by title or keyword using the IETF Datatracker API. Returns up to 25 matching RFC summaries with RFC number, title, abstract, publication date and URLs.",
        {
            query: z.string().trim().min(1).max(200),
            limit: z.number().int().min(1).max(25).default(10),
        },
        async ({ query, limit }) => {
            const url = new URL(
                "https://datatracker.ietf.org/api/v1/doc/document/",
            );
            url.search = new URLSearchParams({
                format: "json",
                type: "rfc",
                title__icontains: query,
                limit: String(limit),
                order_by: "-rfc_number",
            });
            const data = await fetchJson(url);
            if (!Array.isArray(data?.objects))
                throw new Error("Invalid IETF Datatracker search response");
            return {
                totalCount: data.meta?.total_count ?? data.objects.length,
                rfcs: data.objects.slice(0, limit).map((doc) => {
                    const num =
                        doc.rfc_number ??
                        Number.parseInt(
                            String(doc.name ?? "").replace(/^rfc/i, ""),
                            10,
                        );
                    return {
                        rfc: Number.isFinite(num) ? num : doc.name,
                        title: doc.title,
                        abstract: doc.abstract?.trim(),
                        pages: doc.pages,
                        time: doc.time,
                        stdLevel: doc.std_level,
                        stream: doc.stream,
                        url: Number.isFinite(num)
                            ? `https://www.rfc-editor.org/rfc/rfc${num}`
                            : undefined,
                    };
                }),
            };
        },
    ],
    [
        "rfc_metadata",
        "Inspect official RFC Editor metadata for an RFC number, including status, publication date, authors, abstract, obsoletes/obsoleted_by, updates/updated_by and errata URL.",
        {
            rfc: rfcNumber,
        },
        async ({ rfc }) => {
            const data = await fetchJson(
                `https://www.rfc-editor.org/rfc/rfc${rfc}.json`,
            );
            return {
                docId: data.doc_id ?? `RFC${rfc}`,
                rfc,
                title: data.title?.trim(),
                abstract: data.abstract?.trim(),
                status: data.status,
                pubStatus: data.pub_status,
                pubDate: data.pub_date,
                authors: cleanList(data.authors),
                keywords: cleanList(data.keywords),
                obsoletes: cleanList(data.obsoletes),
                obsoletedBy: cleanList(data.obsoleted_by),
                updates: cleanList(data.updates),
                updatedBy: cleanList(data.updated_by),
                seeAlso: cleanList(data.see_also),
                doi: data.doi,
                errataUrl: data.errata_url,
                url: `https://www.rfc-editor.org/rfc/rfc${rfc}`,
            };
        },
    ],
    [
        "rfc_section",
        "Read a specific section heading (such as '3.2' or '4.1.1') or a bounded line range from the canonical plain-text RFC on rfc-editor.org. Returns at most 250 lines per call.",
        {
            rfc: rfcNumber,
            section: z
                .string()
                .trim()
                .regex(/^[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*$/)
                .optional()
                .describe("Section number such as '3', '4.1' or 'A.1'"),
            startLine: z.number().int().min(1).max(200000).optional(),
            maxLines: z.number().int().min(1).max(250).default(120),
        },
        async ({ rfc, section, startLine, maxLines }) => {
            const text = await fetchText(
                `https://www.rfc-editor.org/rfc/rfc${rfc}.txt`,
                "text/plain",
            );
            return {
                rfc,
                section: section ?? null,
                ...extractSection(text, { section, startLine, maxLines }),
                url: `https://www.rfc-editor.org/rfc/rfc${rfc}.txt`,
            };
        },
    ],
];

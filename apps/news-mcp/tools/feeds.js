import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import { getText } from "../fetch.js";

const array = (value) =>
    value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = (value) => (typeof value === "string" ? value : value?.["#text"]);
const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    removeNSPrefix: true,
});
const link = (value, base) => {
    const selected = array(value).find(
        (v) =>
            typeof v === "string" || !v["@_rel"] || v["@_rel"] === "alternate",
    );
    const href = typeof selected === "string" ? selected : selected?.["@_href"];
    if (!href) return undefined;
    try {
        const url = new URL(href, base);
        return ["http:", "https:"].includes(url.protocol)
            ? url.href
            : undefined;
    } catch {
        return undefined;
    }
};

export function parseFeed(xml, base, limit) {
    if (
        /<!DOCTYPE|<!ENTITY/i.test(xml) ||
        XMLValidator.validate(xml) !== true
    ) {
        throw new Error(
            "Feed must be valid XML without DTDs or custom entities.",
        );
    }
    const parsed = parser.parse(xml);
    const root = parsed.rss?.channel ?? parsed.feed;
    if (!root) throw new Error("Response is not an RSS 2.0 or Atom feed.");
    const entries = array(root.item ?? root.entry);
    return {
        title: text(root.title),
        link: link(root.link, base),
        entries: entries.slice(0, limit).map((entry) => ({
            title: text(entry.title),
            link: link(entry.link, base),
            published: text(
                entry.pubDate ?? entry.date ?? entry.published ?? entry.updated,
            ),
            // Keep markup as data; do not promise an HTML sanitiser.
            summary: (
                text(
                    entry.description ??
                        entry.encoded ??
                        entry.summary ??
                        entry.content,
                ) ?? ""
            ).slice(0, 2000),
        })),
        more: entries.length > limit,
    };
}

export const feeds = [
    [
        "feed_read",
        "Read an RSS 2.0 or Atom feed in source order. Summaries may contain untrusted HTML, capped at 2,000 characters. No page scraping.",
        z.object({
            url: z.string().url().max(2048),
            limit: z.number().int().min(1).max(30).default(10),
        }),
        async ({ url, limit }) => {
            const result = await getText(url);
            return parseFeed(result.text, result.url, limit);
        },
    ],
];

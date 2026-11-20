import { z } from "zod";
import { getText } from "../fetch.js";
import { parseFeed } from "./feeds.js";

// A page declares its feed in a <link rel="alternate"> tag; a site that does not is
// usually still publishing one at a conventional path. Both are checked, and every
// candidate is read before it is reported, so a caller never gets a URL that turns out
// not to be a feed.
//
// A candidate is accepted on its root element rather than on parseFeed, because parseFeed
// refuses any document with a DOCTYPE, and that refusal is deliberate: it is what keeps a
// custom entity from expanding. WordPress feeds carry a DOCTYPE, so judging by parseFeed
// would report github.blog's comments feed and miss its main one, which is a false
// negative on the site that matters.
const DECLARED_TYPES = new Set(["application/rss+xml", "application/atom+xml"]);

const CONVENTIONAL_PATHS = [
    "feed",
    "feed.xml",
    "rss",
    "rss.xml",
    "atom.xml",
    "index.xml",
];

// The page fetch plus this many candidate reads is the whole cost of one call.
const MAX_CANDIDATES = 6;

function attributes(tag) {
    const found = {};
    for (const match of tag.matchAll(
        /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g,
    ))
        found[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    return found;
}

function declaredFeeds(html, base) {
    const feeds = [];
    for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
        const found = attributes(match[0]);
        const rel = (found.rel ?? "").toLowerCase().split(/\s+/);
        // A media type can carry parameters; only the type itself decides.
        const type = (found.type ?? "").toLowerCase().split(";")[0].trim();
        if (!rel.includes("alternate") || !DECLARED_TYPES.has(type)) continue;
        if (!found.href) continue;
        try {
            const url = new URL(found.href, base);
            if (url.protocol === "http:" || url.protocol === "https:")
                feeds.push(url.href);
        } catch {
            // A malformed href is not a reason to abandon the rest of the page.
        }
    }
    return [...new Set(feeds)];
}

// The root element, with the XML declaration, comments, whitespace and a possible
// document type declaration removed first.
function rootElement(xml) {
    const body = xml
        .replace(/^\uFEFF/, "")
        .replace(/<\?xml[\s\S]*?\?>/g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?[^>]*>/gi, "")
        .trimStart();
    if (/^<rss\b/i.test(body)) return "rss";
    if (/^<feed\b/i.test(body)) return "atom";
    if (/^<rdf:RDF\b/i.test(body)) return "rdf";
    return null;
}

// Comparison only: /rss and /rss/ are the same resource, and a site that lists both
// should not fill the answer with one feed twice.
function canonical(url) {
    return url.replace(/\/$/, "");
}

// Description of a document that is already in hand, or null when it is not a feed.
function describeFeed(text, url) {
    const type = rootElement(text);
    if (!type) return null;
    let title = null;
    try {
        title = parseFeed(text, url, 1).title ?? null;
    } catch {
        // Readable as a feed but not by feed_read, which rejects a DOCTYPE.
    }
    return { url, type, title };
}

async function readFeed(url) {
    try {
        const result = await getText(url);
        return describeFeed(result.text, result.url);
    } catch {
        return null;
    }
}

export const discoverTools = [
    [
        "feed_discover",
        'Find the RSS or Atom feed of a website. Checks the <link rel="alternate"> tags the page declares, then the conventional paths, and reads each candidate before reporting it, so every URL returned is one that answered with a feed. Each feed is reported with its root element and its title when the title could be read; a feed that carries a document type declaration has no title here, because reading it is refused by the entity-expansion guard in feed_read. Returns an empty list when the site publishes no feed, which is a different answer from an error. Use the returned URL with feed_read. No page text is returned, only the feeds.',
        {
            url: z
                .string()
                .url()
                .max(2048)
                .describe(
                    "The page or feed URL to start from, for example https://github.blog.",
                ),
        },
        async ({ url }) => {
            const page = await getText(url);
            // A page that is itself a feed has already been read, so it is described
            // from what is in hand rather than fetched a second time.
            const direct = describeFeed(page.text, page.url);
            if (direct) return { url: page.url, feeds: [direct] };

            const candidates = [
                ...declaredFeeds(page.text, page.url),
                // Conventional paths sit at the site root. Resolving them against a post
                // URL would probe /2024/01/post/feed instead of /feed.
                ...CONVENTIONAL_PATHS.map(
                    (path) => new URL(`/${path}`, page.url).href,
                ),
            ].slice(0, MAX_CANDIDATES);

            const feeds = [];
            const seen = new Set();
            for (const candidate of candidates) {
                const feed = await readFeed(candidate);
                if (!feed || seen.has(canonical(feed.url))) continue;
                seen.add(canonical(feed.url));
                feeds.push(feed);
            }
            return { url: page.url, feeds };
        },
    ],
];

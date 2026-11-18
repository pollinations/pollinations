import { z } from "zod";
import { fetchJson } from "../fetch.js";

// Ubuntu source package names are lowercase: a letter or digit, then
// letters, digits, plus, dot or hyphen.
const SOURCE = /^[a-z0-9][a-z0-9+.-]*$/;
// Ubuntu release names are lowercase: a letter, then letters, digits or hyphen.
const SERIES = /^[a-z][a-z0-9-]*$/;
const POCKETS = ["Release", "Security", "Updates", "Proposed", "Backports"];

function seriesLink(series) {
    return `https://api.launchpad.net/1.0/ubuntu/${series}`;
}

function seriesName(link) {
    return link.slice(link.lastIndexOf("/") + 1);
}

function summarize(entry) {
    return {
        name: entry.source_package_name,
        version: entry.source_package_version,
        series: seriesName(entry.distro_series_link),
        pocket: entry.pocket,
        published: entry.date_published,
        status: entry.status,
    };
}

export async function publishedSources({ source, series, pocket, limit }) {
    const name = source.trim().toLowerCase();
    if (!SOURCE.test(name))
        throw new Error(
            "Use a lowercase Ubuntu source package name, like firefox",
        );
    const size =
        Number.isInteger(limit) && limit >= 1 && limit <= 10 ? limit : 5;
    let release;
    if (series !== undefined) {
        release = series.trim().toLowerCase();
        if (!SERIES.test(release))
            throw new Error("Use an Ubuntu release name, like noble");
    }
    if (pocket !== undefined && !POCKETS.includes(pocket))
        throw new Error(`Use a pocket of ${POCKETS.join(", ")}`);
    const params = new URLSearchParams({
        "ws.op": "getPublishedSources",
        source_name: name,
        exact_match: "true",
        "ws.size": String(size),
    });
    if (release) params.set("distro_series", seriesLink(release));
    if (pocket) params.set("pocket", pocket);
    const url = `https://api.launchpad.net/1.0/ubuntu/+archive/primary?${params}`;
    let data;
    try {
        data = await fetchJson(url);
    } catch (error) {
        // A 400 can only mean the release does not exist: the source name,
        // pocket and page size are all validated in-handler first.
        if (release && /HTTP 400/.test(error.message))
            throw new Error(`No Ubuntu release named ${release}`);
        throw error;
    }
    const entries = data.entries ?? [];
    return {
        source: name,
        series: release ?? null,
        pocket: pocket ?? null,
        total: data.total_size ?? entries.length,
        sources: entries.map(summarize),
    };
}

export const launchpadTools = [
    [
        "launchpad_source",
        "Look up a source package in Ubuntu's primary archive on Launchpad and return its published versions across Ubuntu releases, with the release name, pocket and publication date. `total` is the whole match count, not the number returned. Debian and AUR lookups answer other distros; this one is Ubuntu only. A release name filters to one release; without it the results span every release. No key needed, one fetch per call.",
        {
            source: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .describe("Ubuntu source package name, e.g. `firefox`"),
            series: z
                .string()
                .trim()
                .min(1)
                .max(50)
                .optional()
                .describe(
                    "Ubuntu release name, e.g. `noble`; omit to search every release",
                ),
            pocket: z
                .enum(POCKETS)
                .optional()
                .describe(
                    "Archive pocket: Release, Security, Updates, Proposed or Backports",
                ),
            limit: z.number().int().min(1).max(10).default(5),
        },
        publishedSources,
    ],
];

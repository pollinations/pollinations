import { z } from "zod";
import { fetchJson } from "../fetch.js";

const SERVICE_INDEX = "https://api.nuget.org/v3/index.json";

function searchService(index) {
    const resources = Array.isArray(index?.resources) ? index.resources : [];
    const resource = resources.find((item) => {
        const types = Array.isArray(item?.["@type"])
            ? item["@type"]
            : [item?.["@type"]];
        return types.some(
            (type) =>
                typeof type === "string" &&
                /^SearchQueryService(?:\/|$)/.test(type),
        );
    });
    if (typeof resource?.["@id"] !== "string")
        throw new Error("NuGet service index has no SearchQueryService resource");

    const url = new URL(resource["@id"]);
    if (
        url.protocol !== "https:" ||
        !(url.hostname === "nuget.org" || url.hostname.endsWith(".nuget.org")) ||
        url.username ||
        url.password ||
        url.port
    )
        throw new Error("NuGet SearchQueryService must use an HTTPS nuget.org host");
    return url;
}

function summary(item) {
    const description =
        typeof item.description === "string" ? item.description : "";
    const versions = Array.isArray(item.versions) ? item.versions : [];
    return {
        id: item.id,
        version: item.version,
        title: item.title ?? null,
        description: description.slice(0, 2000),
        description_truncated: description.length > 2000,
        authors: item.authors ?? null,
        owners: item.owners ?? null,
        total_downloads: item.totalDownloads ?? null,
        verified: typeof item.verified === "boolean" ? item.verified : null,
        project_url: item.projectUrl ?? null,
        license_url: item.licenseUrl ?? null,
        tags: item.tags ?? [],
        vulnerabilities: item.vulnerabilities ?? [],
        package_types: (item.packageTypes ?? [])
            .map((entry) => entry?.name)
            .filter((name) => typeof name === "string"),
        version_count: versions.length,
        versions_truncated: versions.length > 5,
        versions: versions.slice(0, 5).map((entry) => ({
            version: entry.version,
            downloads: entry.downloads ?? null,
        })),
    };
}

export async function searchNuget({ query, limit, skip, prerelease }) {
    const index = await fetchJson(SERVICE_INDEX);
    const url = searchService(index);
    url.searchParams.set("q", query.trim());
    url.searchParams.set("skip", String(skip));
    url.searchParams.set("take", String(limit));
    url.searchParams.set("prerelease", String(prerelease));
    url.searchParams.set("semVerLevel", "2.0.0");

    const result = await fetchJson(url.href);
    if (
        !Number.isSafeInteger(result?.totalHits) ||
        result.totalHits < 0 ||
        !Array.isArray(result?.data)
    )
        throw new Error("NuGet search returned an invalid response");

    return {
        query: query.trim(),
        total_hits: result.totalHits,
        skip,
        limit,
        prerelease,
        packages: result.data.map(summary),
    };
}

export const nugetTools = [
    [
        "nuget_package_search",
        "Search public NuGet.org packages by ID, title, description or tags. Returns package metadata, download counts, prefix verification, reported vulnerabilities, package types and up to five matching versions. Pre-release versions are excluded by default. This is registry search metadata, not an independent safety audit.",
        {
            query: z.string().trim().min(1).max(200),
            limit: z.number().int().min(1).max(20).default(10),
            skip: z.number().int().min(0).max(3000).default(0),
            prerelease: z.boolean().default(false),
        },
        searchNuget,
    ],
];

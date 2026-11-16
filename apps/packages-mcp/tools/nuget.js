import { z } from "zod";
import { fetchJson } from "../fetch.js";

// The search index is the one endpoint that answers a version question in a single
// request: the registration index inlines a page of versions only when it holds 64 or
// fewer, so Serilog's 602 versions are spread over ten pages that each have to be
// fetched, and a single version's leaf points at its metadata by URL rather than
// carrying it. One call here returns the package, its current version and every listed
// version with its download count.
const SEARCH_ROOT = "https://azuresearch-usnc.nuget.org/query";
const RECENT_VERSION_LIMIT = 20;

// NuGet package ids: letters, digits, dots, hyphens and underscores.
const PACKAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

// A pre-release version carries a hyphen after the numeric part, for example
// 4.4.1-dev-02453. Those are listed and ordered above the stable ones by the registry,
// so the newest entry is not the one most callers want.
function isPrerelease(version) {
    const separator = version.indexOf("-");
    if (separator < 0) return false;
    const build = version.indexOf("+");
    return build < 0 || separator < build;
}

export const nugetTools = [
    [
        "nuget_package",
        "Look up a NuGet package in the official search index and report which versions exist. Answers the question a model cannot answer from memory and gets wrong by default: the current version, the newest stable version, and whether a version a caller is about to write into a project file exists at all. Returns the package description, authors, project URL, licence URL, tags, verification and total downloads, plus the newest listed versions with their download counts. NuGet's own version ordering puts pre-releases above stable releases, so both are reported separately. No key is needed and nothing of the caller is forwarded.",
        {
            id: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .describe(
                    "NuGet package id, case-insensitive, for example Newtonsoft.Json.",
                ),
            version: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .optional()
                .describe(
                    "Optional exact version to confirm, for example 13.0.3. Case-insensitive; pre-release suffixes count.",
                ),
        },
        async ({ id, version }) => {
            if (!PACKAGE_ID.test(id))
                throw new Error(
                    "A NuGet package id uses letters, digits, dots, hyphens and underscores, and cannot start with a separator.",
                );
            const query = new URLSearchParams({
                q: `packageid:${id}`,
                prerelease: "true",
                semVerLevel: "2.0.0",
                take: "1",
            });
            const payload = await fetchJson(`${SEARCH_ROOT}?${query}`);
            const entry = payload?.data?.[0];
            // The index matches packageid as a whole term, but reports its own id, and
            // casing is not significant in NuGet, so the id is compared folded.
            if (!entry || entry.id.toLowerCase() !== id.toLowerCase())
                throw new Error(`NuGet has no package with the id ${id}.`);

            const versions = Array.isArray(entry.versions)
                ? entry.versions
                : [];
            const stable = versions.filter(
                (item) => !isPrerelease(String(item.version ?? "")),
            );
            const resolved = version
                ? versions.find(
                      (item) =>
                          String(item.version).toLowerCase() ===
                          version.toLowerCase(),
                  )
                : undefined;
            if (version && !resolved)
                throw new Error(
                    `NuGet lists ${versions.length} versions of ${entry.id} and none is ${version}.`,
                );

            return {
                id: entry.id,
                requestedVersion: version
                    ? {
                          version: resolved.version,
                          downloads: resolved.downloads ?? null,
                          isPrerelease: isPrerelease(String(resolved.version)),
                      }
                    : null,
                latestVersion: entry.version ?? null,
                latestStableVersion: stable.at(-1)?.version ?? null,
                isPrerelease: entry.version
                    ? isPrerelease(String(entry.version))
                    : null,
                description: entry.description ?? null,
                authors: entry.authors ?? [],
                projectUrl: entry.projectUrl ?? null,
                licenseUrl: entry.licenseUrl ?? null,
                tags: Array.isArray(entry.tags) ? entry.tags : [],
                verified: entry.verified ?? null,
                totalDownloads: entry.totalDownloads ?? null,
                versionCount: versions.length,
                // Newest first, because that is the order a caller reads them in.
                recentVersions: versions
                    .slice(-RECENT_VERSION_LIMIT)
                    .reverse()
                    .map((item) => ({
                        version: item.version,
                        downloads: item.downloads ?? null,
                        isPrerelease: isPrerelease(String(item.version ?? "")),
                    })),
                vulnerabilities: entry.vulnerabilities ?? [],
            };
        },
    ],
];

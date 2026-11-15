import { prerelease, rcompare, valid } from "semver";
import { z } from "zod";
import { fetchJson, fetchText } from "../fetch.js";

// Registry metadata selection from xiaotian1171 (#17699).
export async function lookup({ ecosystem, name, version }) {
    const patterns = {
        npm: /^(?:@[a-z0-9_~-][a-z0-9._~-]*\/)?[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/,
        pypi: /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/,
        crates: /^[A-Za-z][A-Za-z0-9_-]{0,63}$/,
        rubygems: /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/,
        // Go path elements allow letters, digits and -._~ but cannot start with a dot.
        golang: /^[A-Za-z0-9][-A-Za-z0-9_.]*(?:\/[-A-Za-z0-9_~][-A-Za-z0-9_.~]*)+$/,
        packagist:
            /^[a-z0-9]+(?:[_.-][a-z0-9]+)*\/[a-z0-9]+(?:[_.-][a-z0-9]+)*$/,
        // Flathub app ids are case-sensitive reverse-DNS names, e.g.
        // org.mozilla.firefox or org.gimp.GIMP.
        flathub: /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9][A-Za-z0-9_-]*)+$/,
    };
    if (!patterns[ecosystem].test(name))
        throw new Error(`Invalid ${ecosystem} package name`);
    const encoded = encodeURIComponent(name);
    if (ecosystem === "npm") {
        const data = await fetchJson(
            `https://registry.npmjs.org/${encoded}/${encodeURIComponent(version ?? "latest")}`,
        );
        return {
            ecosystem,
            name: data.name,
            version: data.version,
            description: data.description,
            license: data.license,
            homepage: data.homepage,
            repository: data.repository,
            engines: data.engines,
            os: data.os,
            cpu: data.cpu,
            dependencies: data.dependencies ?? {},
            optionalDependencies: data.optionalDependencies,
            peerDependencies: data.peerDependencies,
            peerDependenciesMeta: data.peerDependenciesMeta,
            deprecated: data.deprecated,
            registryUrl: `https://www.npmjs.com/package/${encoded}/v/${encodeURIComponent(data.version)}`,
        };
    }
    if (ecosystem === "pypi") {
        const data = await fetchJson(
            `https://pypi.org/pypi/${encoded}/${version ? `${encodeURIComponent(version)}/` : ""}json`,
        );
        const info = data.info;
        return {
            ecosystem,
            name: info.name,
            version: info.version,
            description: info.summary,
            license: info.license_expression || info.license,
            projectUrls: info.project_urls,
            requiresPython: info.requires_python,
            dependencies: info.requires_dist,
            yanked: info.yanked,
            yankedReason: info.yanked_reason,
            registryUrl:
                info.package_url ?? `https://pypi.org/project/${encoded}/`,
        };
    }
    if (ecosystem === "rubygems") {
        const data = await fetchJson(
            version
                ? `https://rubygems.org/api/v2/rubygems/${encoded}/versions/${encodeURIComponent(version)}.json`
                : `https://rubygems.org/api/v1/gems/${encoded}.json`,
        );
        const resolved = data.version ?? data.number;
        return {
            ecosystem,
            name: data.name,
            version: resolved,
            description: data.info,
            licenses: data.licenses,
            homepage: data.homepage_uri,
            repository: data.source_code_uri,
            documentation: data.documentation_uri,
            platform: data.platform,
            downloads: data.downloads,
            versionDownloads: data.version_downloads,
            yanked: data.yanked,
            dependencies: data.dependencies,
            registryUrl: `https://rubygems.org/gems/${encodeURIComponent(data.name)}/versions/${encodeURIComponent(resolved)}`,
        };
    }
    if (ecosystem === "packagist") {
        const [vendor, pkg] = name.split("/");
        const data = await fetchJson(
            `https://packagist.org/p2/${encodeURIComponent(vendor)}/${encodeURIComponent(pkg)}.json`,
        );
        // p2 lists are minified: only the first entry is complete, each later one
        // lists the fields that changed and "__unset" removes a field, as in
        // Composer's MetadataMinifier::expand.
        let previous = {};
        const versions = (data.packages?.[name] ?? []).map((entry) => {
            previous = { ...previous, ...entry };
            for (const [key, value] of Object.entries(previous))
                if (value === "__unset") delete previous[key];
            return previous;
        });
        if (versions.length === 0)
            throw new Error(`Packagist package ${name} not found`);
        // Tags are spelled v8.1.11 or 8.1.11; accept either for an exact version.
        const bare = (value) => value.replace(/^v/, "");
        // Composer allows tags such as 2.1 that semver rejects, so stable
        // releases are ranked by version_normalized: four numbers (3.2.0.0),
        // or -patchN on a stable patch release, which ranks above its base.
        // Prereleases carry other suffixes such as -RC1.
        const numbers = (v) =>
            v.version_normalized
                .replace(/-patch(\d*)$/, (_, n) => `.${Number(n) + 1}`)
                .split(".")
                .map(Number);
        const byNewest = (a, b) => {
            const x = numbers(a);
            const y = numbers(b);
            for (let k = 0; k < 5; k++)
                if (x[k] !== y[k]) return (y[k] ?? 0) - (x[k] ?? 0);
            return 0;
        };
        const selected = version
            ? versions.find((v) => bare(v.version) === bare(version))
            : versions
                  .filter((v) =>
                      /^\d+(\.\d+){3}(-patch\d*)?$/.test(v.version_normalized),
                  )
                  .sort(byNewest)[0] || versions[0];
        if (!selected)
            throw new Error(
                `Packagist version ${version} not found for ${name}`,
            );
        return {
            ecosystem,
            name: selected.name,
            version: selected.version,
            description: selected.description,
            license: selected.license,
            homepage: selected.homepage,
            source: selected.source,
            dependencies: selected.require ?? {},
            requireDev: selected["require-dev"] ?? {},
            suggest: selected.suggest,
            registryUrl: `https://packagist.org/packages/${encodeURIComponent(vendor)}/${encodeURIComponent(pkg)}`,
        };
    }
    if (ecosystem === "golang") {
        // The Go proxy writes each capital as "!" plus the lowercase letter.
        const goEscape = (value) =>
            encodeURIComponent(
                value.replace(/[A-Z]/g, (c) => `!${c.toLowerCase()}`),
            );
        const base = `https://proxy.golang.org/${name.split("/").map(goEscape).join("/")}`;
        const info = await fetchJson(
            version
                ? `${base}/@v/${goEscape(version)}.info`
                : `${base}/@latest`,
        );
        return {
            ecosystem,
            name,
            version: info.Version,
            time: info.Time,
            origin: info.Origin ?? null,
            goMod: await fetchText(`${base}/@v/${goEscape(info.Version)}.mod`),
            registryUrl: `https://pkg.go.dev/${name}@${encodeURIComponent(info.Version)}`,
        };
    }
    if (ecosystem === "flathub") {
        // The appstream endpoint is the verified GET source; the POST
        // /api/v2/search route was not verifiable, so it is not used.
        let data;
        try {
            data = await fetchJson(
                `https://flathub.org/api/v2/appstream/${encoded}`,
            );
        } catch (error) {
            if (error instanceof Error && error.message.includes("HTTP 404"))
                throw new Error(`Flathub app ${name} not found`);
            throw error;
        }
        const releases = data.releases ?? [];
        const selected = version
            ? releases.find((release) => release.version === version)
            : (releases.find((release) => release.type === "stable") ??
              releases[0]);
        if (!selected)
            throw new Error(
                version
                    ? `Flathub version ${version} not found for ${name}`
                    : `Flathub app ${name} has no releases`,
            );
        // The description is HTML; strip tags so the field is plain text.
        const longDescription = (data.description ?? "")
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 8000);
        return {
            ecosystem,
            name: data.id,
            displayName: data.name,
            version: selected.version,
            releaseType: selected.type,
            releaseTimestamp: selected.timestamp,
            description: data.summary,
            longDescription: longDescription || undefined,
            license: data.project_license,
            homepage: data.urls?.homepage,
            developer: data.developer_name,
            categories: data.categories,
            keywords: data.keywords,
            isEol: data.is_eol,
            bundle: data.bundle?.value,
            runtime: data.bundle?.runtime,
            releases: releases.map((release) => ({
                version: release.version,
                type: release.type,
                timestamp: release.timestamp,
            })),
            // Screenshot sizes are not ordered, so take the widest one.
            screenshots: (data.screenshots ?? [])
                .map((shot) => {
                    let largest;
                    for (const size of shot.sizes ?? [])
                        if (
                            largest === undefined ||
                            Number(size.width) > Number(largest.width)
                        )
                            largest = size;
                    return largest?.src;
                })
                .filter(Boolean),
            registryUrl: `https://flathub.org/apps/${encoded}`,
        };
    }
    // crates.io asks clients to prefer its unlimited sparse index to the 1 rps API.
    const lower = name.toLowerCase();
    const path =
        lower.length < 3
            ? `${lower.length}/${lower}`
            : lower.length === 3
              ? `3/${lower[0]}/${lower}`
              : `${lower.slice(0, 2)}/${lower.slice(2, 4)}/${lower}`;
    const releases = (await fetchText(`https://index.crates.io/${path}`))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    const selected = version
        ? releases.find((r) => r.vers === version)
        : releases
              .filter((r) => !r.yanked && valid(r.vers) && !prerelease(r.vers))
              .sort((a, b) => rcompare(a.vers, b.vers))[0];
    if (!selected)
        throw new Error(
            version
                ? "Crate version not found"
                : "No non-yanked stable release; request an exact version",
        );
    return {
        ecosystem,
        name: selected.name,
        version: selected.vers,
        rustVersion: selected.rust_version,
        dependencies: selected.deps,
        features: { ...selected.features, ...selected.features2 },
        yanked: selected.yanked,
        registryUrl: `https://crates.io/crates/${encodeURIComponent(selected.name)}/${encodeURIComponent(selected.vers)}`,
    };
}
export const packageTools = [
    [
        "package_lookup",
        "Read live npm/PyPI/RubyGems/Packagist (PHP) package metadata, Go module proxy info and go.mod, crates.io sparse-index versions, dependencies and runtime requirements, or Flathub Linux desktop app metadata. Default: npm latest tag, PyPI latest, RubyGems current version, Go latest, Rust highest non-yanked stable version, PHP highest stable version, Flathub latest stable release. Rust descriptive metadata (license/homepage) is at registryUrl. Does not install or execute packages.",
        {
            ecosystem: z
                .enum([
                    "npm",
                    "pypi",
                    "crates",
                    "rubygems",
                    "golang",
                    "packagist",
                    "flathub",
                ])
                .default("npm"),
            name: z.string().trim().min(1).max(214),
            version: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .regex(/^[A-Za-z0-9][A-Za-z0-9.+!_-]*$/)
                .optional()
                .describe("Exact version, or an npm dist-tag"),
        },
        lookup,
    ],
    [
        "package_downloads",
        "Read npm download counts for a package per day over a period: last-day, last-week, last-month, last-year, or a custom YYYY-MM-DD:YYYY-MM-DD range (npm caps ranges at 18 months). npm packages only.",
        {
            name: z.string().trim().min(1).max(214),
            range: z
                .string()
                .trim()
                .regex(
                    /^(last-(day|week|month|year)|\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2})$/,
                )
                .default("last-week"),
        },
        async ({ name, range }) => {
            if (
                !/^(?:@[a-z0-9_~-][a-z0-9._~-]*\/)?[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/.test(
                    name,
                )
            )
                throw new Error("Invalid npm package name");
            return fetchJson(
                `https://api.npmjs.org/downloads/range/${range}/${encodeURIComponent(name)}`,
            );
        },
    ],
];

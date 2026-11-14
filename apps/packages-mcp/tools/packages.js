import { prerelease, rcompare, valid } from "semver";
import { z } from "zod";
import { fetchJson, fetchText } from "../fetch.js";

// Library dependencies from a .cabal file: one or more `build-depends:`
// blocks in the library section. Conditional blocks nested under `if`
// lines are more indented than the section's fields, so only blocks at
// the field indent count; continuation lines start with a comma.
function parseCabalDependencies(cabal) {
    const lines = cabal.split("\n");
    const start = lines.findIndex((line) => /^library(\s|$)/.test(line));
    if (start === -1) return {};
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (
            /^(executable|test-suite|benchmark|flag|source-repository|library|common)\b/.test(
                lines[i],
            )
        ) {
            end = i;
            break;
        }
    }
    const section = lines.slice(start + 1, end);
    const dependencies = {};
    let fieldIndent = null;
    for (let i = 0; i < section.length; i++) {
        const match = section[i].match(/^(\s*)build-depends:\s*(.*)$/);
        if (!match) continue;
        if (fieldIndent === null) fieldIndent = match[1].length;
        if (match[1].length !== fieldIndent) continue;
        const chunks = [match[2]];
        for (let j = i + 1; j < section.length; j++) {
            const next = section[j];
            if (!next.trim() || !/^\s/.test(next)) break;
            if (next.match(/^\s*/)[0].length <= fieldIndent) break;
            chunks.push(next.trim());
        }
        // Entries are comma-separated; continuation lines start with a
        // comma or sit on their own line, so split on both.
        for (const chunk of chunks.join("\n").split(/[,\n]+/)) {
            const entry = chunk.trim();
            if (!entry) continue;
            const [pkg, ...rest] = entry.split(/\s+/);
            if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(pkg)) continue;
            dependencies[pkg] = rest.join(" ") || null;
        }
    }
    return dependencies;
}

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
        // Hackage names start with a letter and hold letters, digits, hyphens.
        hackage: /^[A-Za-z][A-Za-z0-9-]{0,127}$/,
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
    if (ecosystem === "hackage") {
        // /package/<name>.json maps every version to "normal" or "deprecated".
        const versions = await fetchJson(
            `https://hackage.haskell.org/package/${encoded}.json`,
        );
        const available = Object.keys(versions);
        if (available.length === 0)
            throw new Error(`Hackage package ${name} not found`);
        // Hackage versions are dot-separated numbers (PVP), not semver:
        // "2.3.2.0" has four components, so compare numerically per component.
        const byNewest = (a, b) => {
            const x = a.split(".").map(Number);
            const y = b.split(".").map(Number);
            for (let i = 0; i < Math.max(x.length, y.length); i++)
                if ((x[i] ?? 0) !== (y[i] ?? 0))
                    return (y[i] ?? 0) - (x[i] ?? 0);
            return 0;
        };
        let resolved;
        if (version) {
            if (!available.includes(version))
                throw new Error(
                    `Hackage version ${version} not found for ${name}`,
                );
            resolved = version;
        } else {
            const normal = available.filter((v) => versions[v] === "normal");
            resolved = [...(normal.length ? normal : available)].sort(
                byNewest,
            )[0];
        }
        const [meta, cabal] = await Promise.all([
            fetchJson(
                `https://hackage.haskell.org/package/${encoded}-${encodeURIComponent(resolved)}.json`,
            ),
            // The .cabal file carries the dependencies the metadata JSON omits.
            // A missing or unparsable .cabal must not kill the lookup.
            fetchText(
                `https://hackage.haskell.org/package/${encoded}-${encodeURIComponent(resolved)}/${encoded}.cabal`,
            ).catch(() => null),
        ]);
        return {
            ecosystem,
            name,
            version: resolved,
            description: meta.synopsis ?? null,
            longDescription: meta.description ?? null,
            license: meta.license ?? null,
            homepage: meta.homepage ?? null,
            author: meta.author ?? null,
            uploadedAt: meta.uploaded_at ?? null,
            uploader: meta.uploader ?? null,
            deprecated: versions[resolved] === "deprecated",
            dependencies: parseCabalDependencies(cabal ?? ""),
            registryUrl: `https://hackage.haskell.org/package/${encoded}-${encodeURIComponent(resolved)}`,
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
        "Read live npm/PyPI/RubyGems/Packagist (PHP)/Hackage (Haskell) package metadata, Go module proxy info and go.mod, or crates.io sparse-index versions, dependencies and runtime requirements. Default: npm latest tag, PyPI latest, RubyGems current version, Go latest, Rust highest non-yanked stable version, PHP highest stable version, Haskell highest non-deprecated version. Rust descriptive metadata (license/homepage) is at registryUrl. Does not install or execute packages.",
        {
            ecosystem: z
                .enum([
                    "npm",
                    "pypi",
                    "crates",
                    "rubygems",
                    "golang",
                    "packagist",
                    "hackage",
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

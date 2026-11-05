import { prerelease, rcompare, valid } from "semver";
import { z } from "zod";
import { fetchJson, fetchText } from "../fetch.js";

// Registry metadata selection from xiaotian1171 (#17699).
export async function lookup({ ecosystem, name, version }) {
    const patterns = {
        npm: /^(?:@[a-z0-9_~-][a-z0-9._~-]*\/)?[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/,
        pypi: /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/,
        crates: /^[A-Za-z][A-Za-z0-9_-]{0,63}$/,
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
        "Read live npm/PyPI package metadata or crates.io sparse-index versions, dependencies and runtime requirements. Default: npm latest tag, PyPI latest, Rust highest non-yanked stable version. Rust descriptive metadata (license/homepage) is at registryUrl. Does not install or execute packages.",
        {
            ecosystem: z.enum(["npm", "pypi", "crates"]).default("npm"),
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
];

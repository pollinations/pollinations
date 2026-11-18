import { z } from "zod";
import { fetchText } from "../fetch.js";

// Chocolatey package IDs follow NuGet ID rules: start with a letter or
// digit, then letters, digits, dots, dashes and underscores.
const idPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const versionPattern = /^\d+(\.\d+){0,3}(-[0-9A-Za-z.-]+)?$/;

// NuGet versions carry up to four numeric parts plus an optional prerelease
// suffix, so semver (three parts) cannot rank them. Compare numerically
// per part; a release outranks its prerelease.
const splitVersion = (version) => {
    const dash = version.indexOf("-");
    return {
        parts: (dash === -1 ? version : version.slice(0, dash))
            .split(".")
            .map(Number),
        pre: dash === -1 ? "" : version.slice(dash + 1),
    };
};
const compareVersions = (a, b) => {
    const x = splitVersion(a);
    const y = splitVersion(b);
    for (let i = 0; i < Math.max(x.parts.length, y.parts.length); i++) {
        const diff = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
        if (diff !== 0) return diff;
    }
    if (x.pre === y.pre) return 0;
    return x.pre === "" ? 1 : -1;
};

// The feed is Atom XML, extracted with regexes only — the text is never
// parsed as XML, so there is no entity-expansion (XXE) risk. Values are
// decoded for the five predefined entities only, with &amp; last so a
// literal "&lt;" in the source stays literal.
const decodeEntities = (value) =>
    value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
const entryField = (entry, pattern) => {
    const match = entry.match(pattern);
    return match ? decodeEntities(match[1]) : null;
};

// The feed is Atom XML only: Accept: application/json answers 406, so the
// fetch carries an Atom Accept header (fetch.js `headers`). The feed's
// `Id eq` comparison is case-sensitive — `firefox` matches nothing while
// `Firefox` matches — so the filter uses tolower(Id) and the tool returns
// the canonical casing from the entry. Entries come back newest-first;
// $top=5 keeps the fetch small and the highest version is still picked
// numerically, so feed ordering is never trusted.
export async function chocolateyLookup({ id }) {
    const trimmed = typeof id === "string" ? id.trim() : "";
    if (!idPattern.test(trimmed))
        throw new Error("Invalid Chocolatey package id");
    const xml = await fetchText(
        `https://community.chocolatey.org/api/v2/Packages()?$filter=tolower(Id)%20eq%20'${encodeURIComponent(trimmed.toLowerCase())}'&$select=Id,Version,Title&$top=5`,
        undefined,
        { Accept: "application/atom+xml" },
    );
    if (!xml.includes("<feed"))
        throw new Error("Chocolatey returned an unexpected response");
    const candidates = [];
    for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
        const entryId = entryField(
            entry,
            /<title type="text">([^<]*)<\/title>/,
        );
        const version = entryField(entry, /<d:Version>([^<]*)<\/d:Version>/);
        const title = entryField(entry, /<d:Title>([^<]*)<\/d:Title>/);
        if (entryId && version && title && versionPattern.test(version))
            candidates.push({ id: entryId, version, title });
    }
    if (candidates.length === 0)
        throw new Error(`Chocolatey package ${trimmed} not found`);
    candidates.sort((a, b) => compareVersions(a.version, b.version));
    const latest = candidates[candidates.length - 1];
    return {
        id: latest.id,
        version: latest.version,
        title: latest.title,
        registryUrl: `https://community.chocolatey.org/packages/${encodeURIComponent(latest.id)}/${encodeURIComponent(latest.version)}`,
    };
}

export const chocolateyTools = [
    [
        "chocolatey_package",
        "Look up a Chocolatey package by exact id and return its latest version and title from the community feed (live data, no key). Chocolatey is the Windows package manager; ids are matched case-insensitively and the latest version is picked numerically. One package per call, no version pinning.",
        {
            id: z.string().trim().min(1).max(100),
        },
        chocolateyLookup,
    ],
];

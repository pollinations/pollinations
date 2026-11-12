import { z } from "zod";

// SemVer 2.0.0 precedence (https://semver.org/#spec-item-11): numeric parts
// compare as numbers, a prerelease sorts before its release, dot-separated
// prerelease identifiers compare left to right with numeric ones below
// alphanumeric ones, and build metadata is ignored.
const SEMVER =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const NUMERIC = /^\d+$/;

function compareIdentifiers(left, right) {
    const leftNumeric = NUMERIC.test(left);
    const rightNumeric = NUMERIC.test(right);
    if (leftNumeric && rightNumeric)
        return Math.sign(Number(left) - Number(right));
    // Numeric identifiers always have lower precedence than alphanumeric ones.
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return left < right ? -1 : left > right ? 1 : 0;
}

function compareParsed(left, right) {
    for (const part of ["major", "minor", "patch"]) {
        const result = Math.sign(left[part] - right[part]);
        if (result !== 0) return result;
    }
    if (!left.prerelease.length && !right.prerelease.length) return 0;
    // A release has higher precedence than any of its prereleases.
    if (!left.prerelease.length) return 1;
    if (!right.prerelease.length) return -1;
    const length = Math.max(left.prerelease.length, right.prerelease.length);
    for (let i = 0; i < length; i++) {
        const a = left.prerelease[i];
        const b = right.prerelease[i];
        // A shorter prerelease list has lower precedence when it is a prefix.
        if (a === undefined) return -1;
        if (b === undefined) return 1;
        const result = compareIdentifiers(a, b);
        if (result !== 0) return result;
    }
    return 0;
}

function parse(value) {
    const match = SEMVER.exec(value);
    if (match === null) throw new Error(`Not a semantic version: ${value}`);
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] === undefined ? [] : match[4].split("."),
    };
}

const version = z
    .string()
    .min(5)
    .max(100)
    .describe(
        "Semantic version, for example 1.2.3, 2.0.0-rc.1, or 1.0.0+build.5",
    );

export const versionTools = [
    [
        "compare_versions",
        "Order semantic versions by SemVer precedence, locally: 1.10.0 sorts above 1.9.0, a prerelease such as 1.0.0-rc.1 sorts before 1.0.0, and build metadata is ignored. Returns the ordered list with the newest and oldest named, and rejects anything that is not a semantic version. No network or model calls.",
        {
            versions: z
                .array(version)
                .min(2)
                .max(20)
                .describe("Versions to order, oldest first in the result"),
        },
        async ({ versions }) => {
            const parsed = versions.map((value) => ({
                value,
                // Build metadata is dropped: it is ignored for precedence.
                version: SEMVER.exec(value) ? value.split("+")[0] : value,
                parts: parse(value),
            }));
            parsed.sort((a, b) => compareParsed(a.parts, b.parts));
            const sorted = parsed.map((entry) => entry.version);
            return {
                sorted,
                newest: sorted[sorted.length - 1],
                oldest: sorted[0],
                equal: parsed.every(
                    (entry) =>
                        compareParsed(entry.parts, parsed[0].parts) === 0,
                ),
            };
        },
    ],
];

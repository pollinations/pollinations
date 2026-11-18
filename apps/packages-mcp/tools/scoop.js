import { z } from "zod";
import { fetchJson } from "../fetch.js";

// Scoop bucket manifest names are lowercase, with no slashes or dots at
// the edges. Anything else is rejected before any fetch.
const NAME = /^[a-z0-9][a-z0-9._-]*$/;

// The license field has two shapes in the wild: a plain SPDX string
// ("MPL-2.0") or an object with an identifier ("GPL-2.0-only").
function licenseOf(data) {
    if (typeof data.license === "string") return data.license;
    if (data.license && typeof data.license === "object")
        return data.license.identifier ?? null;
    return null;
}

export async function lookupScoop(name) {
    if (!NAME.test(name))
        throw new Error("Use a lowercase Scoop package name, e.g. git");
    const encoded = encodeURIComponent(name);
    for (const bucket of ["Main", "Extras"]) {
        try {
            const data = await fetchJson(
                `https://raw.githubusercontent.com/ScoopInstaller/${bucket}/master/bucket/${encoded}.json`,
            );
            return {
                name,
                bucket,
                version: data.version ?? null,
                description: data.description ?? null,
                homepage: data.homepage ?? null,
                license: licenseOf(data),
                bucketUrl: `https://github.com/ScoopInstaller/${bucket}/blob/master/bucket/${encoded}.json`,
            };
        } catch (error) {
            // A 404 in Main just means the package lives in Extras; a 404
            // in Extras means it is in neither bucket. Anything else is a
            // real upstream failure and is rethrown as-is.
            if (!/HTTP 404/.test(error.message)) throw error;
            if (bucket === "Extras")
                throw new Error(
                    `Scoop package ${name} not found in Main or Extras`,
                );
        }
    }
}

export const scoopTools = [
    [
        "scoop_package",
        "Look up one Scoop package for Windows by name: current version, description, homepage and license. Tries the Main bucket first, then Extras. Reads the public bucket manifest JSON files from GitHub, not a package API. Does not install packages.",
        {
            name: z.string().trim().min(1).max(100).regex(NAME),
        },
        ({ name }) => lookupScoop(name),
    ],
];

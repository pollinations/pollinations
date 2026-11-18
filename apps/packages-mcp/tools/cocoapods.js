import { z } from "zod";
import { fetchJson } from "../fetch.js";

// CocoaPods pod names are case-sensitive (a lowercase `alamofire` 404s):
// a letter or digit, then letters, digits, dot, underscore, plus or hyphen.
// The case is preserved, never lowercased.
const POD = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

function summarize(version) {
    return { version: version.name, created: version.created_at };
}

export async function podVersions({ pod, limit }) {
    const name = pod.trim();
    if (!POD.test(name))
        throw new Error("Use a CocoaPods pod name, like Alamofire");
    const count =
        Number.isInteger(limit) && limit >= 1 && limit <= 10 ? limit : 5;
    const url = `https://trunk.cocoapods.org/api/v1/pods/${encodeURIComponent(name)}`;
    let data;
    try {
        data = await fetchJson(url);
    } catch (error) {
        // The API answers 404 with `{"error":"No pod found with the
        // specified name."}` for an unknown pod.
        if (/HTTP 404/.test(error.message))
            throw new Error(`No CocoaPod found named ${name}`);
        throw error;
    }
    // The list is chronological, oldest first; the `owners` array carries
    // maintainer emails and is never returned.
    const versions = (data.versions ?? []).map(summarize).reverse();
    return {
        pod: name,
        total: versions.length,
        latest: versions[0]?.version ?? null,
        versions: versions.slice(0, count),
    };
}

export const cocoapodsTools = [
    [
        "cocoapods_versions",
        "Look up a CocoaPod by its exact name on the CocoaPods Trunk API and return its published versions, newest first, with the version name and creation date. `total` is the whole version count, not the number returned. There is no search endpoint, so the pod name must be exact, and names are case-sensitive. No key needed, one fetch per call.",
        {
            pod: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .describe("Exact CocoaPods pod name, e.g. `Alamofire`"),
            limit: z.number().int().min(1).max(10).default(5),
        },
        podVersions,
    ],
];

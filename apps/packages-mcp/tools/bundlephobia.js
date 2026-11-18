import { z } from "zod";
import { fetchJson } from "../fetch.js";

// Same npm-name shape package_downloads already validates.
const packageName =
    /^(?:@[a-z0-9_~-][a-z0-9._~-]*\/)?[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/;
const version = /^[A-Za-z0-9][A-Za-z0-9.+!_-]*$/;
const formatKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

export async function bundleSize({ package: name, version: pinned }) {
    // Zod only applies through the MCP server, so re-validate here too.
    if (!packageName.test(name)) throw new Error("Invalid npm package name");
    if (pinned !== undefined && !version.test(pinned))
        throw new Error("Invalid package version");
    const spec = pinned === undefined ? name : `${name}@${pinned}`;
    let data;
    try {
        data = await fetchJson(
            `https://bundlephobia.com/api/size?package=${encodeURIComponent(spec)}`,
        );
    } catch (error) {
        if (error.message.includes("HTTP 404"))
            throw new Error(`No bundle found for package "${spec}"`);
        throw error;
    }
    if (
        typeof data.name !== "string" ||
        typeof data.version !== "string" ||
        typeof data.size !== "number" ||
        typeof data.gzip !== "number"
    )
        throw new Error("Invalid Bundlephobia response");
    return {
        name: data.name,
        version: data.version,
        size: data.size,
        sizeKb: formatKb(data.size),
        gzip: data.gzip,
        gzipKb: formatKb(data.gzip),
        dependencyCount: data.dependencyCount ?? null,
        description:
            typeof data.description === "string"
                ? data.description.slice(0, 200)
                : null,
    };
}

export const bundlephobiaTools = [
    [
        "bundle_size",
        "Read an npm package's minified bundle size and gzip size from Bundlephobia. Returns the latest version unless a version is pinned. The service builds the bundle on demand, so obscure packages can be slow. Does not install or execute packages.",
        {
            package: z.string().trim().min(1).max(214),
            version: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .regex(/^[A-Za-z0-9][A-Za-z0-9.+!_-]*$/)
                .optional()
                .describe("Exact version, e.g. 18.2.0"),
        },
        bundleSize,
    ],
];

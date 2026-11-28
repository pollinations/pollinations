import { z } from "zod";
import { fetchJson } from "../fetch.js";

// endoflife.date publishes MIT-licensed lifecycle data as static JSON; aliases
// such as `postgres` redirect to the canonical product.
export async function lifecycle({ product, release }) {
    const { result } = await fetchJson(
        `https://endoflife.date/api/v1/products/${product}`,
    );
    const releases = result.releases.map(({ custom, ...rest }) => rest);
    const selected = release
        ? releases.filter((x) => x.name === release)
        : releases;
    if (release && !selected.length)
        throw new Error(
            `No ${result.name} release named ${release}; known releases: ${releases
                .slice(0, 20)
                .map((x) => x.name)
                .join(", ")}`,
        );
    return {
        product: result.name,
        label: result.label,
        category: result.category,
        link: result.links?.html ?? null,
        releasePolicy: result.links?.releasePolicy ?? null,
        releases: selected,
    };
}

export const lifecycleTools = [
    [
        "product_lifecycle",
        "Read end-of-life, end-of-support and LTS dates for a language, runtime, framework, OS, database or device from endoflife.date, newest release first. Each release carries its release date, LTS start, active-support and end-of-life dates, whether it is still maintained and its latest patch version. Use it to check whether a version is supported before pinning or upgrading. Dates come from community-maintained data; confirm critical deadlines on the vendor's release policy page.",
        {
            product: z
                .string()
                .trim()
                .toLowerCase()
                .regex(/^[a-z0-9][a-z0-9.+-]{0,63}$/)
                .describe(
                    "endoflife.date product slug such as `nodejs`, `python`, `ubuntu` or `postgresql`",
                ),
            release: z
                .string()
                .trim()
                .regex(/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/)
                .optional()
                .describe(
                    "Release cycle to return alone, e.g. `20` for Node.js or `3.12` for Python",
                ),
        },
        lifecycle,
    ],
];

import { z } from "zod";
import { fetchJson } from "../fetch.js";

// Docker Hub repository names: lowercase, one optional namespace, no tag.
const REPOSITORY =
    /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)?$/;
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

function repositoryPath(image) {
    if (image.includes(":") || image.includes("@"))
        throw new Error(
            "Put the tag in `tag`, not in `image`: image: node, tag: 22-alpine",
        );
    if (!REPOSITORY.test(image))
        throw new Error(
            "Use a lowercase Docker Hub repository, optionally with one namespace",
        );
    // Docker Hub keeps official images under the `library` namespace.
    return image.includes("/") ? image : `library/${image}`;
}

function platforms(images) {
    const seen = new Set();
    for (const image of images ?? []) {
        const { architecture, os, variant } = image;
        // Build attestations (provenance, SBOM) are listed as unknown/unknown.
        if (
            !architecture ||
            !os ||
            architecture === "unknown" ||
            os === "unknown"
        )
            continue;
        seen.add(
            variant
                ? `${os}/${architecture}/${variant}`
                : `${os}/${architecture}`,
        );
    }
    return [...seen].sort();
}

function summarize(tag) {
    return {
        tag: tag.name,
        last_pushed: tag.tag_last_pushed ?? tag.last_updated,
        size_bytes: tag.full_size,
        digest: tag.digest,
        platforms: platforms(tag.images),
    };
}

export async function imageTags({ image, tag, filter, limit }) {
    const repository = repositoryPath(image);
    const endpoint = `https://hub.docker.com/v2/repositories/${repository}/tags`;
    if (tag) {
        if (!TAG.test(tag)) throw new Error("Invalid Docker tag");
        return {
            repository,
            tag_count: 1,
            tags: [summarize(await fetchJson(`${endpoint}/${tag}`))],
        };
    }
    const data = await fetchJson(
        `${endpoint}?page_size=${limit}&ordering=last_updated${
            filter ? `&name=${encodeURIComponent(filter)}` : ""
        }`,
    );
    return {
        repository,
        tag_count: data.count,
        tags: (data.results ?? []).map(summarize),
    };
}

export async function searchRepositories({ query, limit }) {
    const term = (query ?? "").trim();
    if (!term) throw new Error("Give a search term");
    const pageSize =
        Number.isInteger(limit) && limit >= 1 && limit <= 10 ? limit : 5;
    const data = await fetchJson(
        `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(term)}&page_size=${pageSize}`,
    );
    if (!Array.isArray(data.results))
        throw new Error("Unexpected response from Docker Hub");
    return {
        query: term,
        limit: pageSize,
        // `count` is the catalog match count, not the number returned.
        total: data.count ?? data.results.length,
        repositories: data.results.map((repo) => ({
            name: repo.repo_name,
            description: repo.short_description ?? null,
            stars: repo.star_count,
            pulls: repo.pull_count,
            official: repo.is_official,
        })),
    };
}

export const dockerTools = [
    [
        "container_image_tags",
        "List Docker Hub tags for a container image, or read one exact tag. Each result carries the last push time, compressed linux/amd64 size, manifest digest and the platforms it ships, so an agent can pick a tag that exists and pin its digest instead of guessing one. Official images resolve under `library/`. `filter` is Docker Hub's substring match on tag names. Public repositories only: no registry credentials are sent and private repositories are not readable. Does not pull images or report vulnerabilities.",
        {
            image: z
                .string()
                .trim()
                .min(1)
                .max(255)
                .describe(
                    "Repository such as `node` or `grafana/grafana`, without the tag",
                ),
            tag: z
                .string()
                .trim()
                .regex(TAG)
                .optional()
                .describe("Exact tag to read, e.g. `22-alpine`"),
            filter: z
                .string()
                .trim()
                .min(1)
                .max(128)
                .optional()
                .describe("Substring Docker Hub matches against tag names"),
            limit: z.number().int().min(1).max(100).default(25),
        },
        imageTags,
    ],
    [
        "dockerhub_search",
        "Search Docker Hub public repositories by name or keyword. Each result carries the repository name, short description, star count, pull count and whether it is an official image, so an agent can find an image to use instead of guessing one. `total` is the catalog match count, which can be far larger than the page returned. This searches repositories; `container_image_tags` lists tags for a repository you already know. Public repositories only: no registry credentials are sent and private repositories are not readable.",
        {
            query: z
                .string()
                .trim()
                .min(1)
                .max(128)
                .describe("Search term, e.g. `nginx` or `grafana`"),
            limit: z.number().int().min(1).max(10).default(5),
        },
        searchRepositories,
    ],
];

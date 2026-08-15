import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODELS_URL = "https://gen.pollinations.ai/models";
const MEDIA_URL = "https://media.pollinations.ai";
const LEADERBOARD_USER = "voodoohop";
const START_MARKER = "<!-- community-showcase:start -->";
const END_MARKER = "<!-- community-showcase:end -->";
const INSERT_BEFORE = "For billing details when building apps on top";
const README_FILE = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../README.md",
);

const LEADERBOARDS = [
    {
        tag: "community:leaderboard",
        alt: "Community text model leaderboard",
    },
    {
        tag: "community:image-leaderboard",
        alt: "Community image model leaderboard",
    },
];

function cell(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .replace(/\|/g, "&#124;")
        .trim();
}

function categoryLabel(category) {
    if (category.toLowerCase() === "3d") return "3D";
    return `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

export function communityProvidersFromModels(models) {
    const grouped = new Map();
    for (const model of models) {
        const name = model.brand?.trim();
        const url = model.brand_url?.trim();
        if (!model.community || !name || !url) continue;

        const key = `${name}\u0000${url}`;
        const provider = grouped.get(key) ?? {
            name,
            url,
            models: new Set(),
            categories: new Set(),
        };
        if (model.name) provider.models.add(model.name);
        if (model.category) provider.categories.add(model.category);
        grouped.set(key, provider);
    }

    return [...grouped.values()]
        .map((provider) => ({
            name: provider.name,
            url: provider.url,
            modelCount: provider.models.size,
            categories: [...provider.categories].sort(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function renderCommunityShowcase(providers, leaderboards) {
    const providerRows = providers.map(
        (provider) =>
            `| [${cell(provider.name)}](<${provider.url}>) | ${provider.modelCount} | ${provider.categories.map(categoryLabel).join(", ")} |`,
    );
    const images = leaderboards.map(
        (board) =>
            `<a href="${board.url}"><img src="${board.url}" alt="${board.alt}" width="49%" /></a>`,
    );

    return `${START_MARKER}
### Community providers

| Provider | Models | Categories |
|----------|-------:|------------|
${providerRows.join("\n")}

### Latest community leaderboards

<p align="center">
${images.join("\n")}
</p>
${END_MARKER}`;
}

export function updateReadme(readme, section) {
    const start = readme.indexOf(START_MARKER);
    const end = readme.indexOf(END_MARKER);
    if (start !== -1 && end !== -1) {
        return `${readme.slice(0, start)}${section}${readme.slice(end + END_MARKER.length)}`;
    }

    const insertion = readme.indexOf(INSERT_BEFORE);
    if (insertion === -1) {
        throw new Error(`README is missing: ${INSERT_BEFORE}`);
    }
    return `${readme.slice(0, insertion)}${section}\n\n${readme.slice(insertion)}`;
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
}

async function latestLeaderboard(board) {
    const gallery = await fetchJson(
        `${MEDIA_URL}/media?tag=${encodeURIComponent(board.tag)}&limit=1&user=${LEADERBOARD_USER}`,
    );
    if (gallery.user !== LEADERBOARD_USER) {
        throw new Error("Leaderboard gallery user was not verified");
    }
    const item = gallery.items?.[0];
    if (!item?.url) throw new Error(`No leaderboard found for ${board.tag}`);
    return { ...board, url: item.url };
}

export async function main() {
    const [models, leaderboards] = await Promise.all([
        fetchJson(MODELS_URL),
        Promise.all(LEADERBOARDS.map(latestLeaderboard)),
    ]);
    if (!Array.isArray(models)) throw new Error("Invalid model catalog");
    const providers = communityProvidersFromModels(models);
    if (providers.length === 0) throw new Error("No community providers found");

    const readme = readFileSync(README_FILE, "utf8");
    const section = renderCommunityShowcase(providers, leaderboards);
    writeFileSync(README_FILE, updateReadme(readme, section));
    console.log(
        `Updated README.md with ${providers.length} community providers and ${leaderboards.length} leaderboards`,
    );
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    await main();
}

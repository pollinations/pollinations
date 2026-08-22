import assert from "node:assert/strict";
import test from "node:test";
import {
    communityProvidersFromModels,
    renderCommunityShowcase,
    updateReadme,
} from "./update-readme.mjs";

test("groups profiled public community models by provider", () => {
    const providers = communityProvidersFromModels([
        {
            name: "alice/text-one",
            category: "text",
            brand: "Alice AI",
            brand_url: "https://alice.example/",
            community: true,
        },
        {
            name: "alice/image-one",
            category: "image",
            brand: "Alice AI",
            brand_url: "https://alice.example/",
            community: true,
        },
        {
            name: "official",
            category: "text",
            brand: "Official",
            brand_url: "https://official.example/",
        },
        { name: "bob/unbranded", category: "text", community: true },
    ]);

    assert.deepEqual(providers, [
        {
            name: "Alice AI",
            url: "https://alice.example/",
            modelCount: 2,
            categories: ["image", "text"],
        },
    ]);
});

test("renders and replaces the generated README section", () => {
    const section = renderCommunityShowcase(
        [
            {
                name: "Alice | AI",
                url: "https://alice.example/",
                modelCount: 2,
                categories: ["image", "text"],
            },
        ],
        [
            {
                alt: "Community text model leaderboard",
                url: "https://media.pollinations.ai/text-board",
            },
        ],
    );
    const initial = `## Community\n\nFor billing details when building apps on top`;
    const inserted = updateReadme(initial, section);

    assert.match(inserted, /Alice &#124; AI/);
    assert.match(inserted, /community-showcase:start/);
    assert.match(inserted, /media\.pollinations\.ai\/text-board/);
    assert.equal(updateReadme(inserted, section), inserted);
});

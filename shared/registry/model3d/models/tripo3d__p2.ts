export const id = "tripo3d/p2";

export default {
    aliases: [],
    provider: "fal",
    publisher: "Tripo",
    category: "3d",
    addedDate: new Date("2026-09-26").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    alpha: true,
    flatRate: true,
    cost: { completionImageTokens: 1.1 },
    title: "Tripo P2",
    description:
        "Text-to-3D GLB meshes with a 10,000-face target and PBR textures",
    inputModalities: ["text"],
    outputModalities: ["3d"],
} satisfies ModelDefinition;

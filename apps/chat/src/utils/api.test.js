import { afterEach, expect, it, vi } from "vitest";
import { initializeModels } from "./api.js";

afterEach(() => vi.unstubAllGlobals());

it("keeps aliases in every catalog and resolves legacy selections without duplicate options", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url) => {
            if (url.endsWith("/v1/models"))
                return Response.json({
                    data: [
                        {
                            id: "openai/gpt-5.4-nano",
                            aliases: ["openai"],
                            title: "GPT-5.4 Nano",
                        },
                    ],
                });
            if (url.endsWith("/audio/models"))
                return Response.json([
                    {
                        name: "openai/gpt-audio",
                        aliases: ["openai-audio"],
                        title: "GPT Audio",
                    },
                ]);
            return Response.json([
                {
                    name: "black-forest-labs/flux.1-schnell",
                    aliases: ["flux"],
                    title: "FLUX.1 Schnell",
                    output_modalities: ["image"],
                },
                {
                    name: "google/veo-3.1-fast",
                    aliases: ["veo"],
                    title: "Veo",
                    output_modalities: ["video"],
                },
            ]);
        }),
    );
    const catalogs = await initializeModels();
    for (const [catalog, alias] of [
        [catalogs.textModels, "openai"],
        [catalogs.imageModels, "flux"],
        [catalogs.videoModels, "veo"],
        [catalogs.audioModels, "openai-audio"],
    ]) {
        expect(Object.keys(catalog)).toHaveLength(1);
        const model = Object.values(catalog)[0];
        expect(model.aliases).toContain(alias);
    }
});

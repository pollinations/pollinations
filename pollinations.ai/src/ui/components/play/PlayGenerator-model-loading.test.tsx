import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { Model } from "../../../hooks/useModelList";
import { PlayGenerator } from "./PlayGenerator";

function isGenerateDisabled(currentModel?: Model): boolean {
    const html = renderToStaticMarkup(
        <PlayGenerator
            selectedModel="flux"
            currentModel={currentModel}
            prompt="draw a tree"
            apiKey="pk_test_fixture"
            onLoginRequired={() => {}}
        />,
    );
    return /<button[^>]*\bdisabled\b/.test(html);
}

test("Generate stays disabled until the model's metadata has loaded", () => {
    expect(isGenerateDisabled(undefined)).toBe(true);
    expect(
        isGenerateDisabled({
            id: "flux",
            name: "flux",
            title: "Flux",
            type: "image",
            hasImageInput: false,
            hasAudioOutput: false,
            hasVideoOutput: false,
        }),
    ).toBe(false);
});

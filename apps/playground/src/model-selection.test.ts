import type { ModelInfo } from "@pollinations/sdk";
import { expect, it } from "vitest";
import { findModelById } from "./model-selection";

it("preserves Flux as the default and resolves saved aliases without catalog-order dependence", () => {
    const models: ModelInfo[] = [
        { name: "tongyi-mai/z-image-turbo", aliases: ["zimage"] },
        { name: "black-forest-labs/flux.1-schnell", aliases: ["flux"] },
    ];
    expect(findModelById(models, "flux")).toBe(models[1]);
    expect(findModelById(models, "black-forest-labs/flux.1-schnell")).toBe(
        models[1],
    );
    expect(findModelById(models, "zimage")).toBe(models[0]);
    expect(findModelById(models, "missing")).toBeUndefined();
});

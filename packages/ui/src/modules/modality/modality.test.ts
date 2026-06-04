import { describe, expect, it } from "vitest";
import { getModalityColors } from "./colors.ts";

describe("getModalityColors", () => {
    it("maps each modality to its theme", () => {
        expect(getModalityColors("text")?.theme).toBe("blue");
        expect(getModalityColors("image")?.theme).toBe("pink");
        expect(getModalityColors("video")?.theme).toBe("teal");
        expect(getModalityColors("audio")?.theme).toBe("violet");
        expect(getModalityColors("realtime")?.theme).toBe("green");
        expect(getModalityColors("embedding")?.theme).toBe("amber");
    });

    it("normalizes plural / cased aliases", () => {
        expect(getModalityColors("Images")?.theme).toBe("pink");
        expect(getModalityColors("embeddings")?.theme).toBe("amber");
        expect(getModalityColors("AUDIO")?.theme).toBe("violet");
    });

    it("returns null for unknown categories", () => {
        expect(getModalityColors("nope")).toBeNull();
        expect(getModalityColors("")).toBeNull();
    });

    it("recipes are token-based — color is carried by `theme`, not baked in", () => {
        // The class recipes are theme-token based and identical across modalities;
        // the per-modality color comes from applying `theme` (data-theme). This
        // guards against the regression where a consumer renders `.filled`/`.text`
        // without setting the theme and silently inherits the ambient hue.
        const image = getModalityColors("image");
        const audio = getModalityColors("audio");
        expect(image?.filled).toBe(audio?.filled);
        expect(image?.text).toContain("theme");
        expect(image?.theme).not.toBe(audio?.theme);
    });
});

import { describe, expect, it } from "vitest";
import { getModalityColors } from "./colors.ts";

describe("modality", () => {
    it("normalizes plural category names", () => {
        expect(getModalityColors("Images")?.text).toBe("polli:text-pink-800");
        expect(getModalityColors("embeddings")?.text).toBe(
            "polli:text-amber-800",
        );
        expect(getModalityColors("video")?.surface).toBe(
            "polli:border-teal-200 polli:bg-teal-100",
        );
        expect(getModalityColors("video")?.theme).toBe("teal");
    });
});

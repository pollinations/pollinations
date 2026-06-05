import { describe, expect, it } from "vitest";
import { getModalityTheme } from "./themes.ts";

describe("getModalityTheme", () => {
    it("maps each modality to its theme", () => {
        expect(getModalityTheme("text")).toBe("blue");
        expect(getModalityTheme("image")).toBe("pink");
        expect(getModalityTheme("video")).toBe("teal");
        expect(getModalityTheme("audio")).toBe("violet");
        expect(getModalityTheme("realtime")).toBe("green");
        expect(getModalityTheme("embedding")).toBe("amber");
    });

    it("normalizes plural / cased aliases", () => {
        expect(getModalityTheme("Images")).toBe("pink");
        expect(getModalityTheme("embeddings")).toBe("amber");
        expect(getModalityTheme("AUDIO")).toBe("violet");
    });

    it("returns null for unknown categories", () => {
        expect(getModalityTheme("nope")).toBeNull();
        expect(getModalityTheme("")).toBeNull();
    });
});

import { describe, expect, it } from "vitest";
import { canonicalPollenModel, resolveLedgerLabel } from "./modelIdentity";

describe("canonicalPollenModel", () => {
    it("keeps a registry model id unchanged", () => {
        expect(canonicalPollenModel("google", "veo")).toBe("veo");
    });

    it("collapses a registry alias into its model within the same provider", () => {
        expect(canonicalPollenModel("google", "veo-1080p")).toBe("veo");
        expect(canonicalPollenModel("aws", "claude-opus-5")).toBe(
            "claude-large",
        );
    });

    it("does not adopt an alias that belongs to another provider's model", () => {
        // grok-4.5 is an alias of the Azure model grok-4.6; August OpenRouter
        // usage was metered under its own name and must stay separate.
        expect(canonicalPollenModel("openrouter", "grok-4.5")).toBe("grok-4.5");
    });

    it("leaves community and unknown ids visible", () => {
        expect(canonicalPollenModel("community", "Alice/private-model")).toBe(
            "Alice/private-model",
        );
    });
});

describe("resolveLedgerLabel", () => {
    it("treats an empty label as a missing cost breakdown", () => {
        expect(resolveLedgerLabel("fireworks", "  ")).toEqual({
            kind: "blank",
        });
    });

    it("joins a registry model id directly", () => {
        expect(resolveLedgerLabel("aws", "claude-sonnet-5")).toEqual({
            kind: "model",
            model: "claude-sonnet-5",
        });
    });

    it("joins a registry alias only within the model's provider", () => {
        expect(
            resolveLedgerLabel("openrouter", "google/gemini-2.5-flash-lite"),
        ).toEqual({ kind: "model", model: "gemini-fast" });
        expect(
            resolveLedgerLabel("replicate", "google/gemini-2.5-flash-image"),
        ).toEqual({
            kind: "unmapped",
            label: "google/gemini-2.5-flash-image",
        });
    });

    it("joins a provider label from the registry's label table", () => {
        expect(resolveLedgerLabel("azure", "Kontext Pro glbl Images")).toEqual({
            kind: "model",
            model: "kontext",
        });
        expect(resolveLedgerLabel("google", "gemini-3-pro-image")).toEqual({
            kind: "model",
            model: "nanobanana-pro",
        });
    });

    it("reports a label that serves several Pollen models as shared", () => {
        expect(resolveLedgerLabel("elevenlabs", "eleven_v3")).toEqual({
            kind: "shared",
            models: ["elevenlabs", "eleven-dialogue"],
        });
    });

    it("reports a reviewed label with no Pollen model as provider-only", () => {
        expect(
            resolveLedgerLabel("replicate", "topazlabs/image-upscale"),
        ).toEqual({ kind: "provider-only", label: "topazlabs/image-upscale" });
    });

    it("reports an unknown label as unmapped", () => {
        expect(resolveLedgerLabel("azure", "Mystery Meter")).toEqual({
            kind: "unmapped",
            label: "Mystery Meter",
        });
    });
});

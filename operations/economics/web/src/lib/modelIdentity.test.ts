import { describe, expect, it } from "vitest";
import { resolveLedgerLabel } from "./modelIdentity";

describe("resolveLedgerLabel", () => {
    it("treats an empty label as a missing cost breakdown", () => {
        expect(resolveLedgerLabel("fireworks", "  ")).toEqual({
            kind: "blank",
        });
    });

    it("joins a reviewed provider label from the registry label table", () => {
        expect(resolveLedgerLabel("azure", "Kontext Pro glbl Images")).toEqual({
            kind: "model",
            model: "kontext",
        });
        expect(resolveLedgerLabel("google", "gemini-3-pro-image")).toEqual({
            kind: "model",
            model: "nanobanana-pro",
        });
    });

    it("keeps a historical model id verbatim even when today's registry aliases it", () => {
        // gpt-realtime-2 is an alias of gpt-realtime-2.1 today, but it was a
        // separately metered Pollen model with its own Azure meters.
        expect(
            resolveLedgerLabel(
                "azure",
                "gpt-realtime-2 Audio opt Gl 1M Tokens",
            ),
        ).toEqual({ kind: "model", model: "gpt-realtime-2" });
    });

    it("joins a label that is a current registry model id without a table entry", () => {
        // Identity is not an alias: the id names the same accounting identity
        // on every vendor, whether or not Pollen metered it that month.
        expect(resolveLedgerLabel("ovhcloud", "mistral")).toEqual({
            kind: "model",
            model: "mistral",
        });
    });

    it("does not join a registry alias that is not a reviewed label", () => {
        expect(resolveLedgerLabel("azure", "gpt-5-mini")).toEqual({
            kind: "unmapped",
            label: "gpt-5-mini",
        });
    });

    it("prefers a label qualified by the ledger SKU or line item", () => {
        expect(
            resolveLedgerLabel("google", "veo-3-fast", {
                sku: "Veo 3 Fast 1080p Audio Video Generation",
                name: "Vertex AI — Veo 3 Fast 1080p Audio Video Generation",
            }),
        ).toEqual({ kind: "model", model: "veo-1080p" });
        expect(
            resolveLedgerLabel("replicate", "wan-video/wan-2.7-i2v", {
                sku: "video_output_duration_seconds",
                name: "wan-video/wan-2.7-i2v — Output video duration (seconds): wan-27-i2v-720p",
            }),
        ).toEqual({ kind: "model", model: "wan-pro" });
        expect(
            resolveLedgerLabel("google", "veo-3-fast", {
                sku: "3 provider SKUs",
                name: "veo-3-fast",
            }),
        ).toEqual({ kind: "shared", models: ["veo", "veo-1080p"] });
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

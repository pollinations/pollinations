import { expect, it } from "vitest";
import { PRIVATE_CONFIG_FIXTURE } from "../fixtures";
import { PROVIDER_REGISTRY } from "./providerRegistry";
import { assembleVendorJournals, type VendorJournal } from "./vendorJournals";

const journal = (): VendorJournal => ({
    version: 1,
    vendor: PROVIDER_REGISTRY[0],
    recordedAt: "2026-10-16T12:00:00Z",
    forecastRules: {},
    reviewNotes: structuredClone(PRIVATE_CONFIG_FIXTURE.reviewNotes),
});
it("preserves journal entries once and creates source links without changing inputs", () => {
    const content = journal();
    const before = structuredClone(content);
    const result = assembleVendorJournals([
        { id: "drive-id", name: `${content.vendor.id}.json`, content },
    ]);
    expect(result.vendorDetails.providers).toEqual([content.vendor]);
    expect(result.planning.reviewNotes.providerCheckExplanations).toEqual(
        content.reviewNotes.providerCheckExplanations,
    );
    expect(result.planning.vendorDocuments?.[content.vendor.id]).toBe(
        "https://drive.google.com/file/d/drive-id/view",
    );
    expect(content).toEqual(before);
});
it("rejects empty folders, duplicate vendors, mismatched filenames and duplicate rules", () => {
    const content = journal();
    const file = { id: "one", name: `${content.vendor.id}.json`, content };
    expect(() => assembleVendorJournals([])).toThrow("empty");
    expect(() =>
        assembleVendorJournals([file, { ...file, id: "two" }]),
    ).toThrow("duplicate");
    expect(() =>
        assembleVendorJournals([{ ...file, name: "wrong.json" }]),
    ).toThrow("Invalid");
    content.forecastRules = {
        "stripe sales|revenue": { salesStoppedFrom: { kofi: "2026-10-16" } },
    };
    const other = { ...content, vendor: { ...content.vendor, id: "other" } };
    expect(() =>
        assembleVendorJournals([
            file,
            { id: "two", name: "other.json", content: other },
        ]),
    ).toThrow("Duplicate planning rule");
});

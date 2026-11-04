import { expect, it } from "vitest";
import { PRIVATE_CONFIG_FIXTURE } from "../fixtures";
import { journalEntries } from "./VendorJournal";

it("keeps saved review notes and evidence without copying financial forecasts into the journal", () => {
    const config = structuredClone(PRIVATE_CONFIG_FIXTURE);
    const before = structuredClone(config);
    const entries = journalEntries(config);
    const notes = [
        ...config.reviewNotes.providerCheckExplanations,
        ...config.reviewNotes.meterDriftExplanations,
        ...config.reviewNotes.pollenWitnessExplanations,
    ];
    expect(entries).toHaveLength(notes.length);
    for (const note of notes) {
        expect(entries).toContainEqual({
            vendor: note.provider,
            period: note.month,
            kind: expect.any(String),
            note: note.explanation,
            evidence: note.evidence,
        });
    }
    expect(config).toEqual(before);
});

it("links a sales-stream rule to its owning vendor journal", () => {
    const config = structuredClone(PRIVATE_CONFIG_FIXTURE);
    config.forecastRules = {
        "stripe sales|revenue": { salesStoppedFrom: { kofi: "2026-10-16" } },
    };
    expect(
        journalEntries(config).find((entry) => entry.vendor === "kofi"),
    ).toMatchObject({ journalVendor: "stripe", period: "2026-10-16" });
});

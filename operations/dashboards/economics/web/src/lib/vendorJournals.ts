import type { EconomicsPrivateConfig } from "../types";
import type { ProviderDefinition } from "./providerRegistry";

export type VendorJournal = {
    version: 1;
    vendor: Omit<
        ProviderDefinition,
        "aliases" | "modelLabels" | "pollenComputeMode"
    >;
    recordedAt: string;
    forecastRules: EconomicsPrivateConfig["forecastRules"];
    reviewNotes: EconomicsPrivateConfig["reviewNotes"];
};

// A request-time projection, never another stored catalog or journal.
export function assembleVendorJournals(
    files: { id: string; name: string; content: VendorJournal }[],
) {
    const providers: VendorJournal["vendor"][] = [];
    const vendorDocuments: Record<string, string> = {};
    const planning: EconomicsPrivateConfig = {
        recordedAt: "",
        forecastRules: {},
        vendorDocuments,
        reviewNotes: {
            providerCheckExplanations: [],
            meterDriftExplanations: [],
            pollenWitnessExplanations: [],
            archiveChecks: [],
            planNotes: [],
        },
    };
    const seen = new Set<string>();
    for (const file of files) {
        const journal = file.content;
        if (
            journal?.version !== 1 ||
            !journal.vendor?.id ||
            file.name !== `${journal.vendor.id}.json` ||
            seen.has(journal.vendor.id) ||
            !Number.isFinite(Date.parse(journal.recordedAt)) ||
            !journal.reviewNotes ||
            !journal.forecastRules ||
            Object.keys(journal).some(
                (key) =>
                    ![
                        "version",
                        "vendor",
                        "recordedAt",
                        "forecastRules",
                        "reviewNotes",
                    ].includes(key),
            )
        )
            throw new Error(
                `Invalid or duplicate vendor journal: ${file.name}`,
            );
        seen.add(journal.vendor.id);
        providers.push(journal.vendor);
        vendorDocuments[journal.vendor.id] =
            `https://drive.google.com/file/d/${file.id}/view`;
        if (
            !planning.recordedAt ||
            Date.parse(journal.recordedAt) > Date.parse(planning.recordedAt)
        )
            planning.recordedAt = journal.recordedAt;
        for (const [key, value] of Object.entries(journal.forecastRules)) {
            if (Object.hasOwn(planning.forecastRules, key))
                throw new Error(`Duplicate planning rule: ${key}`);
            planning.forecastRules[key] = value;
        }
        for (const key of Object.keys(journal.reviewNotes)) {
            if (
                !Object.hasOwn(planning.reviewNotes, key) ||
                !Array.isArray(
                    journal.reviewNotes[
                        key as keyof typeof journal.reviewNotes
                    ],
                )
            )
                throw new Error(`Invalid review notes: ${file.name}`);
        }
        for (const key of [
            "providerCheckExplanations",
            "meterDriftExplanations",
            "pollenWitnessExplanations",
            "archiveChecks",
            "planNotes",
        ] as const) {
            const notes = journal.reviewNotes[key] ?? [];
            // Each category retains its original entries and within-vendor order.
            (planning.reviewNotes[key] as unknown[]).push(...notes);
        }
    }
    if (!providers.length) throw new Error("Vendor journals folder is empty");
    return { vendorDetails: { version: 1, providers }, planning };
}

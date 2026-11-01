import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { DataTable } from "../components/DataTable";
import { EvidenceAction } from "../components/Evidence";
import type { EconomicsPrivateConfig, VendorLedgerRow } from "../types";

export function journalEntries(
    config: EconomicsPrivateConfig,
    plans: VendorLedgerRow[] = [],
) {
    const entries: {
        vendor: string;
        journalVendor?: string;
        period: string;
        kind: string;
        note: string;
        evidence: string[];
    }[] = [];
    const review = config.reviewNotes;
    for (const [kind, notes] of [
        ["Known limitation", review.providerCheckExplanations],
        ["Cost review", review.meterDriftExplanations],
        ["Usage review", review.pollenWitnessExplanations],
    ] as const)
        for (const note of notes)
            entries.push({
                vendor: note.provider,
                period: note.month,
                kind,
                note: note.explanation,
                evidence: note.evidence,
            });
    for (const note of review.archiveChecks ?? [])
        entries.push({
            vendor: note.provider,
            period: note.month,
            kind: "Evidence review",
            note: `${note.account} · ${note.status.replaceAll("_", " ")} · checked ${note.checkedAt.slice(0, 10)}. ${note.note}`,
            evidence: note.evidence,
        });
    for (const note of review.planNotes ?? []) {
        const plan = plans.find((row) => row.entry_id === note.entryId);
        entries.push({
            vendor: plan?.vendor ?? "Planning",
            period: plan?.start ?? "",
            kind: "Plan note",
            note: note.explanation,
            evidence: [],
        });
    }
    for (const rule of Object.values(config.forecastRules))
        for (const [vendor, date] of Object.entries(
            rule.salesStoppedFrom ?? {},
        ))
            entries.push({
                vendor,
                journalVendor: "stripe",
                period: date,
                kind: `Planning · ${vendor}`,
                note: `No new sales projected from ${date}. Recorded payments remain included.`,
                evidence: [],
            });
    return entries
        .map((entry) => ({
            ...entry,
            evidence: [
                ...new Set([
                    ...entry.evidence,
                    ...(entry.note.match(/https?:\/\/[^\s;]+/g) ?? []),
                ]),
            ],
        }))
        .sort(
            (a, b) =>
                b.period.localeCompare(a.period) ||
                a.vendor.localeCompare(b.vendor),
        );
}

export function VendorJournal({
    entries,
}: {
    entries: ReturnType<typeof journalEntries>;
}) {
    if (!entries.length) return null;
    return (
        <details className="rounded-xl border border-theme-text-soft/20 p-4">
            <summary className="cursor-pointer font-semibold">
                Journal · {entries.length}
            </summary>
            <DataTable className="mt-3">
                <TableHead>
                    <TableRow>
                        <TableHeaderCell>Period</TableHeaderCell>
                        <TableHeaderCell>Note</TableHeaderCell>
                        <TableHeaderCell>Evidence</TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {entries.map((entry, index) => (
                        <TableRow
                            key={`${entry.period}:${entry.kind}:${index}`}
                        >
                            <TableCell>{entry.period || "—"}</TableCell>
                            <TableCell className="min-w-64 whitespace-normal">
                                <p className="text-xs text-theme-text-soft">
                                    {entry.kind}
                                </p>
                                <p className="whitespace-pre-wrap break-words">
                                    {entry.note
                                        .replace(/https?:\/\/[^\s;]+/g, "")
                                        .trim()}
                                </p>
                            </TableCell>
                            <TableCell>
                                <span className="inline-flex flex-wrap gap-2">
                                    {entry.evidence.map((link) => (
                                        <EvidenceAction
                                            key={link}
                                            evidence={link}
                                        />
                                    ))}
                                </span>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </details>
    );
}

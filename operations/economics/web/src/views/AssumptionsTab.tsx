import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { DataTable, TableScroller } from "../components/DataTable";
import { EvidenceAction } from "../components/Evidence";
import type { EconomicsPrivateConfig } from "../types";

// Read the same reviewed configuration that calculations use; never maintain a second list.
export function assumptionRows(config: EconomicsPrivateConfig) {
    const rows: {
        group: string;
        provider: string;
        period: string;
        description: string;
        evidence: string[];
    }[] = [];
    for (const rule of Object.values(config.forecastRules)) {
        for (const [stream, date] of Object.entries(
            rule.salesStoppedFrom ?? {},
        ))
            rows.push({
                group: "Planning",
                provider: stream,
                period: `From ${date}`,
                description:
                    "No new sales projected. Recorded payments remain included; final Stripe fees, refunds and payouts still need verification.",
                evidence: [],
            });
    }
    const rec = config.reviewNotes;
    for (const note of rec.planNotes ?? [])
        rows.push({
            group: "Review notes",
            provider: "Vendor plan",
            period: "",
            description: note.explanation,
            evidence: note.explanation.match(/https?:\/\/[^\s;]+/g) ?? [],
        });
    for (const [group, entries] of [
        ["Accepted historical exceptions", rec.providerCheckExplanations],
        ["Meter review notes", rec.meterDriftExplanations],
        ["Usage review notes", rec.pollenWitnessExplanations],
    ] as const)
        for (const item of entries)
            rows.push({
                group: "Review notes",
                provider: item.provider,
                period: item.month,
                description: `${group}: ${item.explanation}`,
                evidence: item.evidence,
            });
    for (const item of rec.archiveChecks ?? [])
        rows.push({
            group: "Review notes",
            provider: `${item.provider} · ${item.account}`,
            period: item.month,
            description: `${item.status.replaceAll("_", " ")} · checked ${item.checkedAt}. ${item.note}`,
            evidence: item.evidence,
        });
    return rows;
}

export function AssumptionsTab({
    config,
}: {
    config?: EconomicsPrivateConfig;
}) {
    if (!config) return <p>No reviewed configuration loaded.</p>;
    const rows = assumptionRows(config);
    return (
        <section className="flex flex-col gap-4">
            <p className="text-sm text-theme-text-soft">
                Planning assumptions and source review notes. Version:{" "}
                {config.recordedAt
                    ? `${config.recordedAt} UTC`
                    : "not supplied"}
                .
            </p>
            {config.documentUrl ? (
                <a
                    className="text-sm underline"
                    href={config.documentUrl}
                    target="_blank"
                    rel="noreferrer"
                >
                    Open the source document in Drive
                </a>
            ) : null}
            <p className="text-xs text-theme-text-soft">
                Financial facts live in Sales and Vendor. Reconciliation is
                calculated from the ledgers.
            </p>
            {Array.from(new Set(rows.map((row) => row.group))).map((group) => (
                <details
                    key={group}
                    className="rounded-lg border border-theme-border p-3"
                >
                    <summary className="cursor-pointer font-semibold">
                        {group} ·{" "}
                        {rows.filter((row) => row.group === group).length}
                    </summary>
                    <div className="mt-3">
                        <TableScroller>
                            <DataTable>
                                <TableHead>
                                    <TableRow>
                                        <TableHeaderCell>
                                            Provider
                                        </TableHeaderCell>
                                        <TableHeaderCell>
                                            Period
                                        </TableHeaderCell>
                                        <TableHeaderCell>
                                            Decision
                                        </TableHeaderCell>
                                        <TableHeaderCell>
                                            Sources
                                        </TableHeaderCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rows
                                        .filter((row) => row.group === group)
                                        .map((row, i) => (
                                            <TableRow
                                                key={`${row.provider}:${row.period}:${i}`}
                                            >
                                                <TableCell>
                                                    {row.provider}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    {row.period}
                                                </TableCell>
                                                <TableCell className="min-w-80 max-w-3xl whitespace-normal">
                                                    {row.description
                                                        .replace(
                                                            /https?:\/\/[^\s;]+/g,
                                                            "",
                                                        )
                                                        .trim()}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="inline-flex flex-wrap gap-2">
                                                        {Array.from(
                                                            new Set(
                                                                row.evidence,
                                                            ),
                                                        ).map((source) => (
                                                            <EvidenceAction
                                                                key={source}
                                                                evidence={
                                                                    source
                                                                }
                                                            />
                                                        ))}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                </TableBody>
                            </DataTable>
                        </TableScroller>
                    </div>
                </details>
            ))}
        </section>
    );
}

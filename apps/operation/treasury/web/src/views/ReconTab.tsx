import {
    Chip,
    Switch,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useMemo, useState } from "react";
import { DataNote } from "../components/DataNote";
import { DataTable, TableScroller } from "../components/DataTable";
import { canResolveGapStatus, GapActions } from "../components/GapActions";
import { SourceMark, ValueWithSources } from "../components/Provenance";
import { fmtUsd2 } from "../lib/format";
import { statusMeta } from "../lib/recon";
import type { CoverageRow, Data, GapRow } from "../types";

const OK_STATUSES = new Set(["ok", "ok_credit", "accepted"]);

function sortedCoverage(rows: CoverageRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.provider.localeCompare(b.provider) ||
            a.status.localeCompare(b.status),
    );
}

function gapKey(row: Pick<GapRow, "month" | "provider" | "status">) {
    return `${row.month}|${row.provider}|${row.status}`;
}

export function ReconTab({ data }: { data: Data }) {
    const [problemsOnly, setProblemsOnly] = useState(false);
    const [resolveRow, setResolveRow] = useState<CoverageRow | null>(null);
    const gapsByKey = useMemo(() => {
        const byKey = new Map<string, GapRow>();
        const byProviderMonth = new Map<string, GapRow>();

        for (const gap of data.gaps) {
            byKey.set(gapKey(gap), gap);
            byProviderMonth.set(`${gap.month}|${gap.provider}`, gap);
        }

        return { byKey, byProviderMonth };
    }, [data.gaps]);
    const coverage = useMemo(
        () =>
            sortedCoverage(data.coverage).filter(
                (row) => !problemsOnly || !OK_STATUSES.has(row.status),
            ),
        [data.coverage, problemsOnly],
    );

    return (
        <div className="flex flex-col gap-4">
            <DataNote pipe="coverage_ep" rows={coverage.length}>
                One verdict per provider and month: invoices{" "}
                <SourceMark code="IV" /> matched against Wise payments{" "}
                <SourceMark code="WS" /> — missing or mismatched money surfaces
                here first.
            </DataNote>
            <div className="inline-flex w-fit items-center gap-2 text-sm text-theme-text-soft">
                <Switch
                    checked={problemsOnly}
                    onChange={setProblemsOnly}
                    ariaLabel="Show reconciliation problems only"
                />
                problems only
            </div>
            {resolveRow && (
                <GapActions
                    row={resolveRow}
                    onClose={() => setResolveRow(null)}
                />
            )}
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>month</TableHeaderCell>
                            <TableHeaderCell>provider</TableHeaderCell>
                            <TableHeaderCell>billing</TableHeaderCell>
                            <TableHeaderCell>status</TableHeaderCell>
                            <TableHeaderCell>invoice_usd</TableHeaderCell>
                            <TableHeaderCell>payment_usd</TableHeaderCell>
                            {problemsOnly && (
                                <>
                                    <TableHeaderCell>delta_usd</TableHeaderCell>
                                    <TableHeaderCell>
                                        invoice_refs
                                    </TableHeaderCell>
                                    <TableHeaderCell>
                                        payment_refs
                                    </TableHeaderCell>
                                    <TableHeaderCell>note</TableHeaderCell>
                                </>
                            )}
                            <TableHeaderCell>actions</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {coverage.map((row) => {
                            const meta = statusMeta(row.status);
                            const gap =
                                gapsByKey.byKey.get(gapKey(row)) ??
                                gapsByKey.byProviderMonth.get(
                                    `${row.month}|${row.provider}`,
                                );
                            return (
                                <TableRow key={`${row.provider}|${row.month}`}>
                                    <TableCell>{row.month}</TableCell>
                                    <TableCell>{row.provider}</TableCell>
                                    <TableCell>
                                        <ValueWithSources codes={["TB"]}>
                                            {row.billing || "-"}
                                        </ValueWithSources>
                                    </TableCell>
                                    <TableCell>
                                        <ValueWithSources codes={["TB"]}>
                                            <Chip
                                                size="sm"
                                                intent={
                                                    meta.intent ?? undefined
                                                }
                                            >
                                                {row.status}
                                            </Chip>
                                        </ValueWithSources>
                                    </TableCell>
                                    <TableCell>
                                        <ValueWithSources codes={["IV"]}>
                                            {fmtUsd2(row.invoice_usd)}
                                        </ValueWithSources>
                                    </TableCell>
                                    <TableCell>
                                        <ValueWithSources codes={["WS"]}>
                                            {fmtUsd2(row.payment_usd)}
                                        </ValueWithSources>
                                    </TableCell>
                                    {problemsOnly && (
                                        <>
                                            <TableCell>
                                                {fmtUsd2(gap?.delta_usd)}
                                            </TableCell>
                                            <TableCell
                                                title={gap?.invoice_refs}
                                            >
                                                {gap?.invoice_refs || "-"}
                                            </TableCell>
                                            <TableCell
                                                title={gap?.payment_refs}
                                            >
                                                {gap?.payment_refs || "-"}
                                            </TableCell>
                                            <TableCell title={gap?.note}>
                                                <Text as="span" tone="soft">
                                                    {gap?.note || "-"}
                                                </Text>
                                            </TableCell>
                                        </>
                                    )}
                                    <TableCell>
                                        {canResolveGapStatus(row.status) ? (
                                            <button
                                                type="button"
                                                className="font-medium text-theme-link hover:underline"
                                                onClick={() =>
                                                    setResolveRow(row)
                                                }
                                            >
                                                resolve
                                            </button>
                                        ) : (
                                            "-"
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

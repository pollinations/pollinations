import {
    Button,
    Chip,
    Switch,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { Fragment, useMemo, useState } from "react";
import { DataNote } from "../components/DataNote";
import { DataTable, TableScroller } from "../components/DataTable";
import { canResolveGapStatus, GapActions } from "../components/GapActions";
import { HeaderWithSources, SourceMark } from "../components/Provenance";
import { fmtUsd2 } from "../lib/format";
import {
    queuedBalanceKey,
    queuedMeterKey,
    queuedReconKey,
} from "../lib/queued";
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

export function ReconTab({
    data,
    queuedKeys = new Set<string>(),
}: {
    data: Data;
    queuedKeys?: ReadonlySet<string>;
}) {
    const [problemsOnly, setProblemsOnly] = useState(false);
    const [resolveKey, setResolveKey] = useState<string | null>(null);
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
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>actions</TableHeaderCell>
                            <TableHeaderCell>month</TableHeaderCell>
                            <TableHeaderCell>provider</TableHeaderCell>
                            <TableHeaderCell>
                                <HeaderWithSources codes={["TB"]}>
                                    billing
                                </HeaderWithSources>
                            </TableHeaderCell>
                            <TableHeaderCell>
                                <HeaderWithSources codes={["TB"]}>
                                    status
                                </HeaderWithSources>
                            </TableHeaderCell>
                            <TableHeaderCell>
                                <HeaderWithSources codes={["IV"]}>
                                    invoice_usd
                                </HeaderWithSources>
                            </TableHeaderCell>
                            <TableHeaderCell>
                                <HeaderWithSources codes={["WS"]}>
                                    payment_usd
                                </HeaderWithSources>
                            </TableHeaderCell>
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
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {coverage.map((row) => {
                            const meta = statusMeta(row.status);
                            const queued =
                                queuedKeys.has(
                                    queuedReconKey(row.month, row.provider),
                                ) ||
                                queuedKeys.has(
                                    queuedMeterKey(row.month, row.provider),
                                ) ||
                                queuedKeys.has(queuedBalanceKey(row.provider));
                            const gap =
                                gapsByKey.byKey.get(gapKey(row)) ??
                                gapsByKey.byProviderMonth.get(
                                    `${row.month}|${row.provider}`,
                                );
                            const rowKey = `${row.provider}|${row.month}`;
                            return (
                                <Fragment key={rowKey}>
                                    <TableRow>
                                        <TableCell>
                                            {canResolveGapStatus(row.status) ? (
                                                <Button
                                                    size="sm"
                                                    onClick={() =>
                                                        setResolveKey(
                                                            resolveKey ===
                                                                rowKey
                                                                ? null
                                                                : rowKey,
                                                        )
                                                    }
                                                >
                                                    Resolve
                                                </Button>
                                            ) : (
                                                "-"
                                            )}
                                        </TableCell>
                                        <TableCell>{row.month}</TableCell>
                                        <TableCell>{row.provider}</TableCell>
                                        <TableCell>
                                            {row.billing || "-"}
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center gap-1.5">
                                                <Chip
                                                    size="sm"
                                                    intent={
                                                        meta.intent ?? undefined
                                                    }
                                                >
                                                    {row.status}
                                                </Chip>
                                                {queued && (
                                                    <Chip
                                                        size="sm"
                                                        intent="warning"
                                                    >
                                                        queued
                                                    </Chip>
                                                )}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {fmtUsd2(row.invoice_usd)}
                                        </TableCell>
                                        <TableCell>
                                            {fmtUsd2(row.payment_usd)}
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
                                    </TableRow>
                                    {resolveKey === rowKey && (
                                        <TableRow>
                                            <TableCell
                                                colSpan={problemsOnly ? 11 : 7}
                                            >
                                                <GapActions
                                                    row={row}
                                                    onClose={() =>
                                                        setResolveKey(null)
                                                    }
                                                />
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            );
                        })}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
    Tooltip,
} from "@pollinations/ui";
import { useMemo, useState } from "react";
import { CreatorIdentity } from "../components/CreatorIdentity";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { EvidenceAction, EvidencePreview } from "../components/Evidence";
import { StatCards } from "../components/StatCards";
import type { DriveDocumentLink } from "../lib/documents";
import { fmtMarginPct, fmtNumber, fmtPeriod, fmtUsd } from "../lib/format";
import type { MonthFilterValue } from "../lib/months";
import {
    creatorSettlementRows,
    type RevenueShareRow,
    revenueShareRows,
    revenueShareSummary,
} from "../lib/revenueShareEconomics";
import type { Data } from "../types";

const SORT_COLUMNS: readonly SortColumn<RevenueShareRow>[] = [
    { key: "recipient", value: (row) => row.recipientName },
    { key: "sources", value: (row) => row.modelCount + row.appCount },
    { key: "paidUsage", value: (row) => row.paidUsageUsd },
    {
        key: "paidCreatorEarnings",
        value: (row) => row.paidCreatorEarningsUsd,
    },
    {
        key: "paidPollinationsProfit",
        value: (row) => row.paidPollinationsProfitUsd,
    },
    { key: "performance", value: (row) => row.paidPerformancePct },
    { key: "questUsage", value: (row) => row.questUsageUsd },
    {
        key: "questCreatorEarnings",
        value: (row) => row.questCreatorEarningsUsd,
    },
    {
        key: "requests",
        value: (row) => row.paidRequests + row.questRequests,
    },
];

function revenueSources(row: RevenueShareRow) {
    return (
        <span className="flex items-center gap-1.5">
            {row.modelCount > 0 ? (
                <Chip size="sm">
                    {row.modelCount === 1 ? "Model" : "Models"}{" "}
                    {fmtNumber(row.modelCount)}
                </Chip>
            ) : null}
            {row.appCount > 0 ? (
                <Chip size="sm">
                    {row.appCount === 1 ? "App" : "Apps"}{" "}
                    {fmtNumber(row.appCount)}
                </Chip>
            ) : null}
        </span>
    );
}

function RevenueShareTable({ rows }: { rows: RevenueShareRow[] }) {
    const { headerProps, rows: sortedRows } = useSortableRows(
        rows,
        SORT_COLUMNS,
        { key: "paidPollinationsProfit", direction: "desc" },
    );
    const columnCount = 9;

    return (
        <TableScroller>
            <DataTable className="min-w-[1080px]">
                <TableHead>
                    <TableRow>
                        <TableHeaderCell
                            rowSpan={2}
                            {...headerProps("recipient")}
                        >
                            Creator
                        </TableHeaderCell>
                        <TableHeaderCell
                            rowSpan={2}
                            {...headerProps("sources")}
                        >
                            Sources
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={4}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Paid Pollen
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Quest Pollen
                        </TableHeaderCell>
                        <TableHeaderCell
                            rowSpan={2}
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("requests")}
                        >
                            Requests
                        </TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("paidUsage")}
                        >
                            <HeaderHint hint="Cash-backed Paid Pollen charged on the selected revenue-share activity.">
                                Used
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("paidCreatorEarnings")}
                        >
                            <HeaderHint hint="Paid Pollen earned by this creator from their apps and community models.">
                                Earnings
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("paidPollinationsProfit")}
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Pollinations profit on paid requests associated with this creator's apps or models. Requests involving multiple creators are attributed to each relevant creator.",
                                    formula:
                                        "Paid used − all creator earnings − external model cost",
                                }}
                            >
                                Profit
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("performance")}
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Pollinations profit as a proportion of the associated Paid Pollen usage.",
                                    formula: "Pollinations profit ÷ Paid used",
                                }}
                            >
                                Profit %
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("questUsage")}
                        >
                            <HeaderHint hint="Quest Pollen used. It stays inside the Pollinations economy and is never fiat revenue.">
                                Used
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("questCreatorEarnings")}
                        >
                            <HeaderHint hint="Quest Pollen earned by this creator. It remains non-cashable Quest Pollen.">
                                Earnings
                            </HeaderHint>
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        sortedRows,
                        (row) => `${row.month}|${row.recipientId}`,
                    ).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell className="font-semibold">
                                <CreatorIdentity
                                    recipientId={row.recipientId}
                                    githubUsername={row.githubUsername}
                                    recipientName={row.recipientName}
                                />
                            </TableCell>
                            <TableCell>{revenueSources(row)}</TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className={GROUP_BORDER}
                            >
                                {fmtUsd(row.paidUsageUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtUsd(row.paidCreatorEarningsUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtUsd(row.paidPollinationsProfitUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtMarginPct(row.paidPerformancePct)}
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className={GROUP_BORDER}
                            >
                                {fmtUsd(row.questUsageUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtUsd(row.questCreatorEarningsUsd)}
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className={GROUP_BORDER}
                            >
                                <Tooltip
                                    triggerAs="span"
                                    content={`Paid ${fmtNumber(row.paidRequests)} · Quest ${fmtNumber(row.questRequests)}`}
                                >
                                    <span>
                                        {fmtNumber(
                                            row.paidRequests +
                                                row.questRequests,
                                        )}
                                    </span>
                                </Tooltip>
                            </TableCell>
                        </TableRow>
                    ))}
                    {sortedRows.length === 0 ? (
                        <TableRow>
                            <TableCell
                                colSpan={columnCount}
                                className="py-8 text-center text-theme-text-soft"
                            >
                                No revenue share for this selection.
                            </TableCell>
                        </TableRow>
                    ) : null}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

export function RevenueShareTab({
    data,
    month = "",
}: {
    data: Data;
    month?: MonthFilterValue;
}) {
    const [previewDocument, setPreviewDocument] =
        useState<DriveDocumentLink | null>(null);
    const rows = useMemo(() => revenueShareRows(data, month), [data, month]);
    const summary = useMemo(
        () => revenueShareSummary(data, month),
        [data, month],
    );
    const settlements = useMemo(
        () => creatorSettlementRows(data, month),
        [data, month],
    );
    return (
        <div className="flex flex-col gap-4">
            <StatCards
                items={[
                    {
                        label: "Paid Pollen",
                        value: fmtUsd(summary.paidUsageUsd),
                        detail: "used",
                    },
                    {
                        label: "Creator earnings",
                        value: fmtUsd(summary.paidCreatorEarningsUsd),
                        detail: "cash-backed",
                    },
                    {
                        label: "Pollinations profit",
                        value: fmtUsd(summary.paidPollinationsProfitUsd),
                        detail: "after creator earnings and model cost",
                    },
                    {
                        label: "Quest creator earnings",
                        value: fmtUsd(summary.questCreatorEarningsUsd),
                        detail: "never cashable",
                    },
                ]}
            />

            <RevenueShareTable rows={rows} />

            {settlements.length > 0 ? (
                <section className="flex flex-col gap-2">
                    <Text weight="bold">Settlements</Text>
                    <TableScroller>
                        <DataTable className="min-w-[720px]">
                            <TableHead>
                                <TableRow>
                                    <TableHeaderCell>Date</TableHeaderCell>
                                    <TableHeaderCell>Creator</TableHeaderCell>
                                    <TableHeaderCell align="right">
                                        Amount
                                    </TableHeaderCell>
                                    <TableHeaderCell>Method</TableHeaderCell>
                                    <TableHeaderCell>Status</TableHeaderCell>
                                    <TableHeaderCell>Evidence</TableHeaderCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {settlements.map((row) => (
                                    <TableRow key={row.entryId}>
                                        <TableCell>
                                            {fmtPeriod(row.date)}
                                        </TableCell>
                                        <TableCell className="font-semibold">
                                            {row.creator}
                                        </TableCell>
                                        <TableCell align="right" numeric>
                                            {fmtUsd(row.amountUsd)}
                                        </TableCell>
                                        <TableCell>{row.method}</TableCell>
                                        <TableCell>
                                            <Chip intent="success" size="sm">
                                                Paid
                                            </Chip>
                                        </TableCell>
                                        <TableCell>
                                            <EvidenceAction
                                                evidence={row.evidence}
                                                onPreview={setPreviewDocument}
                                                previewLabel="Document"
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </DataTable>
                    </TableScroller>
                </section>
            ) : null}

            <EvidencePreview
                documentLink={previewDocument}
                onClose={() => setPreviewDocument(null)}
                title="Settlement evidence"
            />
        </div>
    );
}

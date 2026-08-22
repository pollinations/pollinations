import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { StatCards } from "../components/StatCards";
import {
    type CommunityEconomicsRow,
    communityEconomicsRows,
    communityEconomicsSummary,
} from "../lib/communityEconomics";
import { fmtMarginPct, fmtNumber, fmtUsd } from "../lib/format";
import { type MonthFilterValue, monthLabel } from "../lib/months";
import type { Data } from "../types";

const SORT_COLUMNS: readonly SortColumn<CommunityEconomicsRow>[] = [
    { key: "month", value: (row) => row.month },
    { key: "model", value: (row) => row.model },
    { key: "paidPollenUsd", value: (row) => row.paidPollenUsd },
    { key: "byopPaidShareUsd", value: (row) => row.byopPaidShareUsd },
    { key: "ownerPaidShareUsd", value: (row) => row.ownerPaidShareUsd },
    { key: "retainedPaidUsd", value: (row) => row.retainedPaidUsd },
    { key: "retainedPct", value: (row) => row.retainedPct },
    { key: "questPollenUsd", value: (row) => row.questPollenUsd },
    { key: "ownerQuestRewardUsd", value: (row) => row.ownerQuestRewardUsd },
    { key: "paidRequests", value: (row) => row.paidRequests },
    { key: "questRequests", value: (row) => row.questRequests },
];

const DEFAULT_SORT = {
    key: "paidPollenUsd",
    direction: "desc",
} as const;

export function CommunityTab({
    data,
    month = "",
}: {
    data: Data;
    month?: MonthFilterValue;
}) {
    const rows = useMemo(
        () => communityEconomicsRows(data, month),
        [data, month],
    );
    const summary = useMemo(() => communityEconomicsSummary(rows), [rows]);
    const { headerProps, rows: sortedRows } = useSortableRows(
        rows,
        SORT_COLUMNS,
        DEFAULT_SORT,
    );

    return (
        <div className="flex flex-col gap-4">
            <StatCards
                items={[
                    {
                        label: "Paid Pollen used",
                        value: fmtUsd(summary.paidPollenUsd),
                        detail: "cash-backed value consumed",
                    },
                    {
                        label: "Retained Paid",
                        value: fmtUsd(summary.retainedPaidUsd),
                        detail: `${fmtMarginPct(summary.retainedPct)} of paid usage`,
                    },
                    {
                        label: "Owner paid share",
                        value: fmtUsd(summary.ownerPaidShareUsd),
                        detail: `BYOP share ${fmtUsd(summary.byopPaidShareUsd)}`,
                    },
                    {
                        label: "Quest Pollen used",
                        value: fmtUsd(summary.questPollenUsd),
                        detail: `owner reward ${fmtUsd(summary.ownerQuestRewardUsd)} · never fiat revenue`,
                    },
                ]}
            />

            <TableScroller>
                <DataTable className="min-w-[1420px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("month")}
                            >
                                Month
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("model")}
                            >
                                Community model
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={5}
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
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Activity
                            </TableHeaderCell>
                        </TableRow>
                        <TableRow>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("paidPollenUsd")}
                            >
                                <HeaderHint hint="Cash-backed Paid Pollen consumed on this community model; not cash collected in this month.">
                                    Used
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("byopPaidShareUsd")}
                            >
                                BYOP share
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("ownerPaidShareUsd")}
                            >
                                Owner share
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("retainedPaidUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Paid Pollen value retained by Pollinations after ecosystem shares.",
                                        formula:
                                            "Paid used − BYOP share − owner share",
                                    }}
                                >
                                    Retained
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("retainedPct")}
                            >
                                Retained %
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("questPollenUsd")}
                            >
                                <HeaderHint hint="Quest Pollen consumed. This is free usage, not revenue.">
                                    Used
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("ownerQuestRewardUsd")}
                            >
                                Owner reward
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("paidRequests")}
                            >
                                Paid req
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("questRequests")}
                            >
                                Quest req
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            sortedRows,
                            (row) => `${row.month}|${row.model}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{monthLabel(row.month)}</TableCell>
                                <TableCell className="font-semibold">
                                    {row.model}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    numeric
                                    className={GROUP_BORDER}
                                >
                                    {fmtUsd(row.paidPollenUsd)}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(row.byopPaidShareUsd)}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(row.ownerPaidShareUsd)}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(row.retainedPaidUsd)}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtMarginPct(row.retainedPct)}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    numeric
                                    className={GROUP_BORDER}
                                >
                                    {fmtUsd(row.questPollenUsd)}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(row.ownerQuestRewardUsd)}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    numeric
                                    className={GROUP_BORDER}
                                >
                                    {fmtNumber(row.paidRequests)}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtNumber(row.questRequests)}
                                </TableCell>
                            </TableRow>
                        ))}
                        {sortedRows.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={11}
                                    className="py-8 text-center text-theme-text-soft"
                                >
                                    No community model economics for this
                                    selection.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

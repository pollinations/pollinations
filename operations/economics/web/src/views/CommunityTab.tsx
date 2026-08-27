import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
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
import { Gauge } from "../components/EconomicsGauge";
import { StatCards } from "../components/StatCards";
import {
    type CommunityEconomicsRow,
    communityEconomicsRows,
    communityEconomicsSummary,
} from "../lib/communityEconomics";
import { fmtMarginPct, fmtNumber, fmtUsd } from "../lib/format";
import type { MonthFilterValue } from "../lib/months";
import type { Data } from "../types";

const SORT_COLUMNS: readonly SortColumn<CommunityEconomicsRow>[] = [
    { key: "model", value: (row) => row.model },
    { key: "retainedPaidUsd", value: (row) => row.retainedPaidUsd },
    { key: "retainedPct", value: (row) => row.retainedPct },
    {
        key: "usageMix",
        value: (row) => {
            const total = row.paidPollenUsd + row.questPollenUsd;
            return total > 0 ? row.paidPollenUsd / total : null;
        },
    },
    { key: "questPollenUsd", value: (row) => row.questPollenUsd },
    {
        key: "requests",
        value: (row) => row.paidRequests + row.questRequests,
    },
];

const DEFAULT_SORT = {
    key: "retainedPaidUsd",
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
                        label: "Retained Paid",
                        value: fmtUsd(summary.retainedPaidUsd),
                        detail: "after ecosystem payouts",
                    },
                    {
                        label: "Performance",
                        value: fmtMarginPct(summary.retainedPct),
                        detail: "retained Paid ÷ gross Paid used",
                    },
                    {
                        label: "Quest used",
                        value: fmtUsd(summary.questPollenUsd),
                        detail: "free usage · never fiat revenue",
                    },
                    {
                        label: "Requests",
                        value: fmtNumber(
                            summary.paidRequests + summary.questRequests,
                        ),
                        detail: "Paid plus Quest",
                    },
                ]}
            />

            <TableScroller>
                <DataTable className="min-w-[820px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("model")}
                            >
                                Community model
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={3}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Pollen
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("retainedPct")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Share of gross Paid usage retained by Pollinations after ecosystem payouts.",
                                        formula:
                                            "retained Paid ÷ gross Paid used",
                                    }}
                                >
                                    Performance
                                </HeaderHint>
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
                                {...headerProps("retainedPaidUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Cash-backed Paid Pollen retained by Pollinations after BYOP and model-owner payouts.",
                                        formula:
                                            "Paid used − BYOP share − owner share",
                                    }}
                                >
                                    Paid retained
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="center"
                                {...headerProps("usageMix")}
                            >
                                <HeaderHint hint="Usage mix — amber is gross Paid Pollen and green is Quest Pollen.">
                                    Usage mix
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("questPollenUsd")}
                            >
                                <HeaderHint hint="Quest Pollen consumed. This is free usage, not revenue.">
                                    Quest used
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            sortedRows,
                            (row) => `${row.month}|${row.model}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell className="font-semibold">
                                    {row.model}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    numeric
                                    className={GROUP_BORDER}
                                >
                                    <Tooltip
                                        triggerAs="span"
                                        content={
                                            <span className="block max-w-72">
                                                <span className="block">
                                                    Gross Paid:{" "}
                                                    {fmtUsd(row.paidPollenUsd)}
                                                </span>
                                                <span className="block">
                                                    BYOP payout:{" "}
                                                    {fmtUsd(
                                                        row.byopPaidShareUsd,
                                                    )}{" "}
                                                    · owner payout:{" "}
                                                    {fmtUsd(
                                                        row.ownerPaidShareUsd,
                                                    )}
                                                </span>
                                            </span>
                                        }
                                    >
                                        <span>
                                            {fmtUsd(row.retainedPaidUsd)}
                                        </span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell>
                                    <div className="flex justify-center">
                                        <Gauge
                                            left={row.paidPollenUsd}
                                            leftLabel="Paid"
                                            right={row.questPollenUsd}
                                            rightLabel="Quest"
                                        />
                                    </div>
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(row.questPollenUsd)}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    numeric
                                    className={GROUP_BORDER}
                                >
                                    {fmtMarginPct(row.retainedPct)}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    numeric
                                    className={GROUP_BORDER}
                                >
                                    <Tooltip
                                        triggerAs="span"
                                        content={
                                            <span className="block max-w-72">
                                                Paid{" "}
                                                {fmtNumber(row.paidRequests)} ·
                                                Quest{" "}
                                                {fmtNumber(row.questRequests)}
                                            </span>
                                        }
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
                        {sortedRows.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
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

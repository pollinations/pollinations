import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
} from "@pollinations/ui";
import { useMemo } from "react";
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
import { fmtNumber } from "../lib/format";
import type { MonthFilterValue } from "../lib/months";
import {
    type RevenueShareLedgerRow,
    revenueShareLedgerRows,
} from "../lib/revenueShareEconomics";
import type { Data } from "../types";

const SORT_COLUMNS: readonly SortColumn<RevenueShareLedgerRow>[] = [
    { key: "developer", value: (row) => row.recipientName },
    { key: "type", value: (row) => row.source.type },
    { key: "product", value: (row) => row.source.name },
    { key: "paidUsage", value: (row) => row.paidUsageUsd },
    {
        key: "paidEarnings",
        value: (row) => row.paidCreatorEarningsUsd,
    },
    { key: "questUsage", value: (row) => row.questUsageUsd },
    {
        key: "questEarnings",
        value: (row) => row.questCreatorEarningsUsd,
    },
    {
        key: "requests",
        value: (row) => row.paidRequests + row.questRequests,
    },
];

function productDetail(row: RevenueShareLedgerRow) {
    if (row.source.type === "model" || row.source.models.length === 0) {
        return row.source.id;
    }
    return (
        <span className="block max-w-80">
            <span className="block font-semibold">
                {fmtNumber(row.source.models.length)} models
            </span>
            {row.source.models.map((model) => (
                <span key={model} className="block">
                    {model}
                </span>
            ))}
        </span>
    );
}

export function RevenueShareLedgerTab({
    data,
    month = "",
}: {
    data: Data;
    month?: MonthFilterValue;
}) {
    const baseRows = useMemo(
        () => revenueShareLedgerRows(data, month),
        [data, month],
    );
    const { headerProps, rows } = useSortableRows(baseRows, SORT_COLUMNS, {
        key: "paidEarnings",
        direction: "desc",
    });

    return (
        <TableScroller>
            <DataTable className="min-w-[980px]">
                <TableHead>
                    <TableRow>
                        <TableHeaderCell
                            rowSpan={2}
                            {...headerProps("developer")}
                        >
                            Creator
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2} {...headerProps("type")}>
                            Type
                        </TableHeaderCell>
                        <TableHeaderCell
                            rowSpan={2}
                            {...headerProps("product")}
                        >
                            Product
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
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
                            <HeaderHint hint="Paid Pollen used on requests associated with this product. It can overlap another source on the same request.">
                                Used
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("paidEarnings")}
                        >
                            <HeaderHint hint="Cash-backed earning credited to this developer for this product.">
                                Earnings
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("questUsage")}
                        >
                            <HeaderHint hint="Quest Pollen used on requests associated with this product. It can overlap another source on the same request.">
                                Used
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("questEarnings")}
                        >
                            <HeaderHint hint="Non-cashable Quest Pollen credited to this developer for this product.">
                                Earnings
                            </HeaderHint>
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        rows,
                        (row) =>
                            `${row.month}|${row.recipientId}|${row.source.type}|${row.source.id}`,
                    ).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell className="font-semibold">
                                <CreatorIdentity
                                    recipientId={row.recipientId}
                                    githubUsername={row.githubUsername}
                                    recipientName={row.recipientName}
                                />
                            </TableCell>
                            <TableCell>
                                <Chip size="sm">
                                    {row.source.type === "app"
                                        ? "App"
                                        : "Model"}
                                </Chip>
                            </TableCell>
                            <TableCell>
                                <Tooltip
                                    triggerAs="span"
                                    content={productDetail(row)}
                                >
                                    <span className="font-semibold">
                                        {row.source.name}
                                    </span>
                                </Tooltip>
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className={GROUP_BORDER}
                            >
                                {fmtNumber(row.paidUsageUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtNumber(row.paidCreatorEarningsUsd)}
                            </TableCell>
                            <TableCell
                                align="right"
                                numeric
                                className={GROUP_BORDER}
                            >
                                {fmtNumber(row.questUsageUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtNumber(row.questCreatorEarningsUsd)}
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
                    {rows.length === 0 ? (
                        <TableRow>
                            <TableCell
                                colSpan={8}
                                className="py-8 text-center text-theme-text-soft"
                            >
                                No revenue-share ledger rows for this selection.
                            </TableCell>
                        </TableRow>
                    ) : null}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

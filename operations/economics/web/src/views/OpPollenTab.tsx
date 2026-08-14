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
import { fmtNumber, fmtPeriod } from "../lib/format";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
} from "../lib/months";
import type { Data, OpPollenRow } from "../types";

function opPollenKey(row: OpPollenRow) {
    return [row.month, row.vendor, row.model, row.currency].join("|");
}

export function OpPollenTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const baseRows = useMemo(() => {
        return (data.opPollen ?? []).filter(
            (row) =>
                matchesMonth(row.month, month) &&
                matchesValue(row.vendor, vendor),
        );
    }, [data.opPollen, month, vendor]);
    const sortColumns = useMemo<SortColumn<OpPollenRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "vendor", value: (row) => row.vendor },
            { key: "model", value: (row) => row.model },
            { key: "currency", value: (row) => row.currency },
            { key: "cost_paid", value: (row) => row.cost_paid },
            { key: "cost_quests", value: (row) => row.cost_quests },
            { key: "price_paid", value: (row) => row.price_paid },
            { key: "price_quests", value: (row) => row.price_quests },
            { key: "byop_paid", value: (row) => row.byop_paid },
            { key: "byop_quests", value: (row) => row.byop_quests },
            { key: "model_paid", value: (row) => row.model_paid },
            { key: "model_quests", value: (row) => row.model_quests },
            { key: "requests_paid", value: (row) => row.requests_paid },
            { key: "requests_quests", value: (row) => row.requests_quests },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "month",
        direction: "desc",
    });

    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell rowSpan={2} {...headerProps("month")}>
                            Month
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2} {...headerProps("vendor")}>
                            Vendor
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2} {...headerProps("model")}>
                            Model
                        </TableHeaderCell>
                        <TableHeaderCell
                            rowSpan={2}
                            {...headerProps("currency")}
                        >
                            Currency
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Cost
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Price
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            BYOP
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Model
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Requests
                        </TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("cost_paid")}
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Provider cost for usage served through paid Pollen.",
                                    tables: "op_pollen_api",
                                    sources: "TB",
                                }}
                            >
                                Paid
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("cost_quests")}
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Provider cost for usage served through quest Pollen.",
                                    tables: "op_pollen_api",
                                    sources: "TB",
                                }}
                            >
                                Quest
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("price_paid")}
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Pollen charged to paid balances before ecosystem shares.",
                                    tables: "op_pollen_api",
                                    sources: "TB",
                                }}
                            >
                                Paid
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("price_quests")}
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Pollen value consumed from quest balances.",
                                    tables: "op_pollen_api",
                                    sources: "TB",
                                }}
                            >
                                Quest
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("byop_paid")}
                        >
                            Paid
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("byop_quests")}
                        >
                            Quest
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("model_paid")}
                        >
                            Paid
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("model_quests")}
                        >
                            Quest
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("requests_paid")}
                        >
                            Paid
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("requests_quests")}
                        >
                            Quest
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, opPollenKey).map(
                        ({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{fmtPeriod(row.month)}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{row.model}</TableCell>
                                <TableCell>{row.currency}</TableCell>
                                <TableCell
                                    align="right"
                                    className={GROUP_BORDER}
                                >
                                    {fmtNumber(row.cost_paid)}
                                </TableCell>
                                <TableCell align="right">
                                    {fmtNumber(row.cost_quests)}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    className={GROUP_BORDER}
                                >
                                    {fmtNumber(row.price_paid)}
                                </TableCell>
                                <TableCell align="right">
                                    {fmtNumber(row.price_quests)}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    className={GROUP_BORDER}
                                >
                                    {fmtNumber(row.byop_paid)}
                                </TableCell>
                                <TableCell align="right">
                                    {fmtNumber(row.byop_quests)}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    className={GROUP_BORDER}
                                >
                                    {fmtNumber(row.model_paid)}
                                </TableCell>
                                <TableCell align="right">
                                    {fmtNumber(row.model_quests)}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    className={GROUP_BORDER}
                                >
                                    {fmtNumber(row.requests_paid)}
                                </TableCell>
                                <TableCell align="right">
                                    {fmtNumber(row.requests_quests)}
                                </TableCell>
                            </TableRow>
                        ),
                    )}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

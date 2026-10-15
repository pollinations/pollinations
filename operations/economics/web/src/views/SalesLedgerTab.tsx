import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
} from "../components/DataTable";
import {
    type MonthFilterValue,
    matchesMonth,
    monthLabel,
    WINDOW_START,
} from "../lib/months";
import { salesCoverage } from "../lib/sales";
import type { Data, StripeSalesRow } from "../types";

const amounts = [
    ["gross_sales", "Gross sales"],
    ["refunds", "Refunds"],
    ["reversals", "Reversals"],
    ["stripe_fees", "Fees"],
    ["net_after_fees", "Net after fees"],
] as const;
const money = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const columns: SortColumn<StripeSalesRow>[] = [
    { key: "month", value: (row) => row.month },
    { key: "stream", value: (row) => row.revenue_stream },
    { key: "currency", value: (row) => row.currency },
    ...amounts.map(([key]) => ({
        key,
        value: (row: StripeSalesRow) => row[key],
    })),
];

export function SalesLedgerTab({
    data,
    month = "",
    now = new Date(),
}: {
    data: Data;
    month?: MonthFilterValue;
    now?: Date;
}) {
    const currentMonth = now.toISOString().slice(0, 7);
    const baseRows = (data.stripeSales ?? []).filter(
        (row) => row.month >= WINDOW_START && matchesMonth(row.month, month),
    );
    const { rows, headerProps } = useSortableRows(baseRows, columns, {
        key: "month",
        direction: "desc",
    });
    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("stream")}>
                            Stream
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("month")}>
                            Month
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            Currency
                        </TableHeaderCell>
                        {amounts.map(([key, label]) => (
                            <TableHeaderCell
                                key={key}
                                align="right"
                                {...headerProps(key)}
                            >
                                {label}
                            </TableHeaderCell>
                        ))}
                        <TableHeaderCell>Month coverage</TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow
                            key={`${row.month}|${row.revenue_stream}|${row.currency}`}
                        >
                            <TableCell>
                                {row.revenue_stream === "kofi"
                                    ? "Ko-fi"
                                    : "Pollen"}
                            </TableCell>
                            <TableCell>{monthLabel(row.month)}</TableCell>
                            <TableCell>{row.currency}</TableCell>
                            {amounts.map(([key]) => (
                                <TableCell key={key} align="right" numeric>
                                    {money.format(row[key])}
                                </TableCell>
                            ))}
                            <TableCell>
                                {row.month >= currentMonth
                                    ? "In progress"
                                    : salesCoverage(
                                          baseRows.filter(
                                              (other) =>
                                                  other.month === row.month,
                                          ),
                                      )}
                            </TableCell>
                        </TableRow>
                    ))}
                    {!rows.length && (
                        <TableRow>
                            <TableCell
                                colSpan={9}
                                className="py-8 text-center text-theme-text-soft"
                            >
                                No sales data recorded for this selection
                                {month === currentMonth
                                    ? " · month in progress"
                                    : ""}
                                .
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

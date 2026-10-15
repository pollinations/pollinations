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
import { EvidenceAction } from "../components/Evidence";
import {
    type MonthFilterValue,
    matchesMonth,
    monthLabel,
    WINDOW_START,
} from "../lib/months";
import {
    FRAUD_COMPONENTS,
    salesFraudAdjustment,
} from "../lib/salesAdjustments";
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
                        <TableHeaderCell align="right">
                            Identified fraud costs
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
                            <TableCell align="right" numeric>
                                <FraudDetail data={data} sale={row} />
                            </TableCell>
                            {amounts.map(([key]) => (
                                <TableCell key={key} align="right" numeric>
                                    {money.format(row[key])}
                                </TableCell>
                            ))}
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

function FraudDetail({ data, sale }: { data: Data; sale: StripeSalesRow }) {
    const adjustment = salesFraudAdjustment(data, sale);
    if (!adjustment) return <span>–</span>;
    const labels = {
        refunds: "Refunds",
        reversals: "Reversals",
        stripe_fees: "Dispute fees",
    };
    return (
        <details className="min-w-36">
            <summary className="cursor-pointer">
                {money.format(adjustment.total)}
            </summary>
            <ul className="mt-2 space-y-1 text-left text-xs">
                {FRAUD_COMPONENTS.map((key) => (
                    <li key={key}>
                        {labels[key]}: {money.format(adjustment[key])}
                    </li>
                ))}
                <li>Earlier sales · actual deductions unchanged</li>
                <li className="flex gap-2">
                    {adjustment.evidence.map((link) => (
                        <EvidenceAction key={link} evidence={link} />
                    ))}
                </li>
            </ul>
        </details>
    );
}

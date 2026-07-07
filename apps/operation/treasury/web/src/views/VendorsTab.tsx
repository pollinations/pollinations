import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { fmtPct, fmtUsd } from "../lib/format";
import {
    type Coverage,
    type VendorPlanes,
    vendorPlanes,
} from "../lib/insights";
import { matchesMonth, monthLabel } from "../lib/months";
import type { Data } from "../types";

const DELTA_ALARM_PCT = 25;

function CoverageCell({ value }: { value: Coverage }) {
    if (value == null) return <span className="text-theme-text-soft">–</span>;
    if (value === "uncovered" || value === "paid unverified") {
        return (
            <Chip intent="warning" size="sm">
                ⚠ {value}
            </Chip>
        );
    }
    return <span className="text-theme-text-soft">{value}</span>;
}

export function visiblePlaneRows({
    month,
    rows,
    vendor,
}: {
    month: string;
    rows: VendorPlanes[];
    vendor: string;
}) {
    return rows.filter(
        (row) =>
            matchesMonth(row.month, month) &&
            (vendor === "all" || row.vendor === vendor),
    );
}

export function VendorsTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const allRows = useMemo(() => vendorPlanes(data), [data]);
    const baseRows = useMemo(
        () => visiblePlaneRows({ rows: allRows, month, vendor }),
        [allRows, month, vendor],
    );
    const sortColumns = useMemo<SortColumn<VendorPlanes>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "vendor", value: (row) => row.vendor },
            { key: "transactionsUsd", value: (row) => row.transactionsUsd },
            { key: "providerUsd", value: (row) => row.providerUsd },
            { key: "creditUsd", value: (row) => row.creditUsd },
            { key: "pollenUsd", value: (row) => row.pollenUsd },
            {
                key: "providerVsPollenPct",
                value: (row) => row.providerVsPollenPct,
            },
            { key: "coverage", value: (row) => row.coverage },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "month",
        direction: "desc",
    });

    return (
        <div className="flex flex-col gap-3">
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("month")}>
                                month
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("vendor")}>
                                vendor
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("transactionsUsd")}
                            >
                                <HeaderHint hint="Cash actually sent to the vendor: Wise compute outflows, by transaction month. Empty = no cash left the bank that month (credits, prepaid balance, or arrears billing).">
                                    transactions
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("providerUsd")}>
                                <HeaderHint hint="What the provider's own billing meter says we consumed that month (credit + paid parts).">
                                    provider
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("creditUsd")}>
                                <HeaderHint hint="The slice of provider consumption covered by granted credits - consumed, but no cash out.">
                                    of it credit
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("pollenUsd")}>
                                <HeaderHint hint="What our own metering registered as cost for this vendor's models: cost_paid + cost_quests (Pollen ≈ $).">
                                    pollen
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("providerVsPollenPct")}
                            >
                                <HeaderHint
                                    hint={`(provider − pollen) / pollen. Positive = the vendor charges more than our registry thinks. Red past ±${DELTA_ALARM_PCT}%.`}
                                >
                                    Δ provider vs pollen
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("coverage")}>
                                <HeaderHint hint="Is this consumption funded? ok cash = Wise cash that month · ok credit = provider credit burn · cash ±1mo = cash lands in an adjacent month (prepaid/arrears) · internal = no payment expected · ⚠ uncovered = active in pollen but no funding found · ⚠ paid unverified = provider says we paid cash the bank never saw.">
                                    coverage
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.month}|${row.vendor}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{monthLabel(row.month)}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>
                                    {fmtUsd(row.transactionsUsd)}
                                </TableCell>
                                <TableCell>{fmtUsd(row.providerUsd)}</TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {fmtUsd(row.creditUsd)}
                                </TableCell>
                                <TableCell>{fmtUsd(row.pollenUsd)}</TableCell>
                                <TableCell
                                    className={
                                        row.providerVsPollenPct != null &&
                                        Math.abs(row.providerVsPollenPct) >
                                            DELTA_ALARM_PCT
                                            ? "text-intent-danger-text"
                                            : "text-theme-text-soft"
                                    }
                                >
                                    {fmtPct(row.providerVsPollenPct)}
                                </TableCell>
                                <TableCell>
                                    <CoverageCell value={row.coverage} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
            <Text size="micro" tone="soft">
                one spend, three witnesses — transactions: cash from the bank
                (Wise) · provider: their own meter · pollen: our metering
                (Pollen ≈ $) · – = that witness has no data, never zero · Δ red
                when |Δ| &gt; {DELTA_ALARM_PCT}% · coverage = every
                pollen-active vendor-month must be funded by cash or credit
            </Text>
        </div>
    );
}

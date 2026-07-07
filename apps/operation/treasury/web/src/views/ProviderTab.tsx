import {
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
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { SourceCell } from "../components/Provenance";
import { fmtPeriod } from "../lib/format";
import { matchesMonth } from "../lib/months";
import type { Data, GrantRow, ProviderMonthlyRow } from "../types";

// Sentinel from the grants datasource: 1970-01-01 = no expiry.
const NO_EXPIRY = "1970-01-01";

export function visibleProviderRows({
    providerRows,
    month,
    vendor,
}: {
    providerRows: ProviderMonthlyRow[];
    month: string;
    vendor: string;
}) {
    return providerRows.filter(
        (row) =>
            matchesMonth(row.month, month) &&
            (vendor === "all" || row.vendor === vendor),
    );
}

// Grants have a start/expiry, not a month — the month filter does not apply.
export function visibleGrantRows({
    grantRows,
    vendor,
}: {
    grantRows: GrantRow[];
    vendor: string;
}) {
    return grantRows.filter((row) => vendor === "all" || row.vendor === vendor);
}

function SectionLabel({ children }: { children: string }) {
    return (
        <Text
            size="micro"
            tone="soft"
            weight="bold"
            className="uppercase tracking-wide"
        >
            {children}
        </Text>
    );
}

function GrantsTable({ rows: baseRows }: { rows: GrantRow[] }) {
    const sortColumns = useMemo<SortColumn<GrantRow>[]>(
        () => [
            { key: "vendor", value: (row) => row.vendor },
            { key: "label", value: (row) => row.label },
            { key: "granted", value: (row) => row.granted },
            { key: "currency", value: (row) => row.currency },
            { key: "start", value: (row) => row.start_date },
            {
                key: "expires",
                value: (row) => (row.expires === NO_EXPIRY ? "" : row.expires),
            },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "vendor",
        direction: "asc",
    });
    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("vendor")}>
                            vendor
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("label")}>
                            label
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("granted")}>
                            granted
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            currency
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("start")}>
                            start
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("expires")}>
                            expires
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        rows,
                        (row) => `${row.vendor}|${row.label}`,
                    ).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell>{row.vendor}</TableCell>
                            <TableCell>{row.label || "–"}</TableCell>
                            <TableCell>{row.granted}</TableCell>
                            <TableCell>{row.currency}</TableCell>
                            <TableCell>{row.start_date}</TableCell>
                            <TableCell>
                                {row.expires === NO_EXPIRY ? "–" : row.expires}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

function MonthlyTable({ rows: baseRows }: { rows: ProviderMonthlyRow[] }) {
    const sortColumns = useMemo<SortColumn<ProviderMonthlyRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "source", value: (row) => row.source },
            { key: "vendor", value: (row) => row.vendor },
            { key: "credit", value: (row) => row.credit },
            { key: "paid", value: (row) => row.paid },
            { key: "currency", value: (row) => row.currency },
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
                        <TableHeaderCell {...headerProps("month")}>
                            month
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("source")}>
                            source
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("vendor")}>
                            vendor
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("credit")}>
                            credit
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("paid")}>
                            paid
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            currency
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        rows,
                        (row) =>
                            `${row.month}|${row.vendor}|${row.source}|${row.currency}|${row.credit}|${row.paid}`,
                    ).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell>{fmtPeriod(row.month)}</TableCell>
                            <TableCell>
                                <SourceCell sources={[row.source]} />
                            </TableCell>
                            <TableCell>{row.vendor}</TableCell>
                            <TableCell>{row.credit}</TableCell>
                            <TableCell>{row.paid}</TableCell>
                            <TableCell>{row.currency}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

export function ProviderTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const grantRows = useMemo(
        () => visibleGrantRows({ grantRows: data.grants, vendor }),
        [data.grants, vendor],
    );
    const monthlyRows = useMemo(
        () =>
            visibleProviderRows({
                providerRows: data.providerMonthly,
                month,
                vendor,
            }),
        [data.providerMonthly, month, vendor],
    );
    return (
        <div className="flex flex-col gap-6">
            {grantRows.length > 0 && (
                <div className="flex flex-col gap-2">
                    <SectionLabel>grants · grants_api</SectionLabel>
                    <GrantsTable rows={grantRows} />
                </div>
            )}
            <div className="flex flex-col gap-2">
                <SectionLabel>monthly · provider_monthly_api</SectionLabel>
                <MonthlyTable rows={monthlyRows} />
            </div>
        </div>
    );
}

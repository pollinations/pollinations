import {
    Chip,
    cn,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    type MonthlyLedgerAuditProviderCount,
    type MonthlyLedgerAuditRow,
    type MonthlyLedgerAuditStatus,
    monthlyLedgerAuditRows,
} from "../lib/ledgerAudit";
import { type MonthFilterValue, monthName } from "../lib/months";
import type { Data } from "../types";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
} from "./DataTable";

const STATUS_INTENT = {
    clean: "success",
    attention: "warning",
    structural: "danger",
} as const;

const STATUS_LABEL = {
    clean: "clean",
    attention: "review",
    structural: "structural",
} as const;

const STATUS_RANK: Record<MonthlyLedgerAuditStatus, number> = {
    structural: 0,
    attention: 1,
    clean: 2,
};

const SORT_COLUMNS: SortColumn<MonthlyLedgerAuditRow>[] = [
    { key: "status", value: (row) => STATUS_RANK[row.status] },
    { key: "month", value: (row) => row.month },
    { key: "transactionRows", value: (row) => row.transactionRows },
    { key: "cloudRows", value: (row) => row.cloudRows },
    { key: "pollenRows", value: (row) => row.pollenRows },
    {
        key: "actionableTransactionEvidenceGaps",
        value: (row) => row.actionableTransactionEvidenceGaps,
    },
    {
        key: "acknowledgedTransactionEvidenceGaps",
        value: (row) => row.acknowledgedTransactionEvidenceGaps,
    },
    { key: "missingMappings", value: (row) => row.missingMappings },
    { key: "estimatedFx", value: (row) => row.estimatedFx },
    { key: "invalidRows", value: (row) => row.invalidRows },
    { key: "duplicateRows", value: (row) => row.duplicateRows },
];

function NumberCell({ value }: { value: number }) {
    return <TableCell align="right">{value.toLocaleString()}</TableCell>;
}

function BankRowsCell({ row }: { row: MonthlyLedgerAuditRow }) {
    return (
        <TableCell align="right" className={GROUP_BORDER}>
            {row.missingBankData ? (
                <Tooltip
                    triggerAs="span"
                    content="No bank transactions are present for this closed month. Confirm the statement import before closing it."
                >
                    <span className="text-intent-warning-text underline decoration-dotted underline-offset-2">
                        0
                    </span>
                </Tooltip>
            ) : (
                row.transactionRows.toLocaleString()
            )}
        </TableCell>
    );
}

function IssueCountCell({
    value,
    vendors,
    vendorCounts,
    className,
}: {
    value: number;
    vendors: string[];
    vendorCounts?: MonthlyLedgerAuditProviderCount[];
    className?: string;
}) {
    return (
        <TableCell
            align="right"
            className={cn(className, value > 0 && "text-intent-warning-text")}
        >
            {value > 0 ? (
                <Tooltip
                    triggerAs="span"
                    content={
                        <span className="block max-w-72">
                            <strong>Vendors</strong>
                            <span className="mt-1 block">
                                {vendorCounts && vendorCounts.length > 0
                                    ? vendorCounts
                                          .map(
                                              ({ provider, count }) =>
                                                  `${provider} (${count.toLocaleString()})`,
                                          )
                                          .join(", ")
                                    : vendors.length > 0
                                      ? vendors.join(", ")
                                      : "Unknown"}
                            </span>
                        </span>
                    }
                >
                    <span className="underline decoration-dotted decoration-theme-border underline-offset-2">
                        {value.toLocaleString()}
                    </span>
                </Tooltip>
            ) : (
                value.toLocaleString()
            )}
        </TableCell>
    );
}

export function MonthlyLedgerAuditPanel({
    data,
    month,
}: {
    data: Data;
    month: MonthFilterValue;
}) {
    const baseRows = useMemo(
        () => monthlyLedgerAuditRows(data, month),
        [data, month],
    );
    const { headerProps, rows } = useSortableRows(baseRows, SORT_COLUMNS, null);

    return (
        <TableScroller>
            <DataTable className="min-w-[900px]">
                <TableHead>
                    <TableRow>
                        <TableHeaderCell rowSpan={2} {...headerProps("status")}>
                            Status
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2} {...headerProps("month")}>
                            Month
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={3}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Ledger rows
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Evidence
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={4}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Data checks
                        </TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell
                            {...headerProps("transactionRows")}
                            className={GROUP_BORDER}
                            align="right"
                        >
                            Bank
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("cloudRows")}
                            align="right"
                        >
                            Compute &amp; Infra
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("pollenRows")}
                            align="right"
                        >
                            Pollen
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps(
                                "actionableTransactionEvidenceGaps",
                            )}
                            align="right"
                            className={GROUP_BORDER}
                        >
                            <HeaderHint hint="Transactions with evidence that is missing or still unresolved. These items block the monthly close. Hover a non-zero count to see the number for each vendor.">
                                Missing
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps(
                                "acknowledgedTransactionEvidenceGaps",
                            )}
                            align="right"
                        >
                            <HeaderHint hint="Permanent evidence losses that are documented and accepted. These remain visible but do not block the monthly close. Hover a non-zero count to see the number for each vendor.">
                                Exceptions
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("missingMappings")}
                            align="right"
                            className={GROUP_BORDER}
                        >
                            <HeaderHint hint="Unique vendor names that do not resolve to the canonical vendor registry. These must be mapped before the month is structurally clean. Hover a non-zero count to see the vendors.">
                                Unmapped vendors
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("estimatedFx")}>
                            <HeaderHint hint="Published uses that month's recorded exchange rate. Estimated uses the latest published rate for a current or future month; a closed month without its rate fails instead of being guessed.">
                                FX rate
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("invalidRows")}
                            align="right"
                        >
                            <HeaderHint hint="Ledger rows that fail required identity, date, source, category, currency, or numeric-value checks. Invalid rows block a structurally clean month. Hover a non-zero count to see the vendors.">
                                Invalid rows
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("duplicateRows")}
                            align="right"
                        >
                            <HeaderHint hint="Extra ledger rows sharing the same source and entry ID. Duplicate rows block a structurally clean month. Hover a non-zero count to see the vendors.">
                                Duplicates
                            </HeaderHint>
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.month}>
                            <TableCell>
                                {row.partial ? (
                                    <Chip intent="neutral" size="sm">
                                        partial
                                    </Chip>
                                ) : (
                                    <Chip
                                        intent={STATUS_INTENT[row.status]}
                                        size="sm"
                                    >
                                        {STATUS_LABEL[row.status]}
                                    </Chip>
                                )}
                            </TableCell>
                            <TableCell>{monthName(row.month)}</TableCell>
                            <BankRowsCell row={row} />
                            <NumberCell value={row.cloudRows} />
                            <NumberCell value={row.pollenRows} />
                            <IssueCountCell
                                value={row.actionableTransactionEvidenceGaps}
                                vendors={[]}
                                vendorCounts={
                                    row.actionableTransactionEvidenceProviderCounts
                                }
                                className={GROUP_BORDER}
                            />
                            <IssueCountCell
                                value={row.acknowledgedTransactionEvidenceGaps}
                                vendors={[]}
                                vendorCounts={
                                    row.acknowledgedTransactionEvidenceProviderCounts
                                }
                            />
                            <IssueCountCell
                                value={row.missingMappings}
                                vendors={row.missingMappingProviders}
                                className={GROUP_BORDER}
                            />
                            <TableCell className={GROUP_BORDER}>
                                <Chip
                                    intent={
                                        row.estimatedFx ? "warning" : "neutral"
                                    }
                                    size="sm"
                                >
                                    {row.estimatedFx
                                        ? "estimated"
                                        : "published"}
                                </Chip>
                            </TableCell>
                            <IssueCountCell
                                value={row.invalidRows}
                                vendors={row.invalidProviders}
                            />
                            <IssueCountCell
                                value={row.duplicateRows}
                                vendors={row.duplicateProviders}
                            />
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}

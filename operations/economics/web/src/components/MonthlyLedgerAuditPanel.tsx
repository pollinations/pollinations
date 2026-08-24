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
    type MonthlyLedgerAuditRow,
    type MonthlyLedgerAuditStatus,
    monthlyLedgerAuditRows,
} from "../lib/ledgerAudit";
import { type MonthFilterValue, monthLabel } from "../lib/months";
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
    clean: "free",
    attention: "warning",
    structural: "danger",
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
    { key: "forecastRows", value: (row) => row.forecastRows },
    {
        key: "transactionEvidenceGaps",
        value: (row) => row.transactionEvidenceGaps,
    },
    { key: "missingMappings", value: (row) => row.missingMappings },
    { key: "estimatedFx", value: (row) => row.estimatedFx },
    { key: "invalidRows", value: (row) => row.invalidRows },
    { key: "duplicateRows", value: (row) => row.duplicateRows },
];

function NumberCell({ value }: { value: number }) {
    return <TableCell align="right">{value.toLocaleString()}</TableCell>;
}

function IssueCountCell({
    value,
    vendors,
    className,
}: {
    value: number;
    vendors: string[];
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
                            <strong>Affected vendors</strong>
                            <span className="mt-1 block">
                                {vendors.length > 0
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
                            colSpan={4}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Ledger rows
                        </TableHeaderCell>
                        <TableHeaderCell
                            rowSpan={2}
                            {...headerProps("transactionEvidenceGaps")}
                            align="right"
                            className={GROUP_BORDER}
                        >
                            <HeaderHint hint="Transactions whose invoice, receipt, statement, or reconciliation reference is not archived in Drive. Hover a non-zero count to see the affected vendors.">
                                Missing documents
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            rowSpan={2}
                            {...headerProps("missingMappings")}
                            align="right"
                            className={GROUP_BORDER}
                        >
                            <HeaderHint hint="Vendors in the ledgers that do not resolve to a canonical vendor. Hover a non-zero count to see them.">
                                Unmapped
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={3}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Integrity
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
                            {...headerProps("forecastRows")}
                            align="right"
                        >
                            Forecast
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("estimatedFx")}
                            className={GROUP_BORDER}
                        >
                            <HeaderHint hint="Estimated means a future EUR or CAD row is converted using the latest published monthly rate. Closed months without a published rate fail instead of being guessed.">
                                FX
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("invalidRows")}
                            align="right"
                        >
                            Invalid
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("duplicateRows")}
                            align="right"
                        >
                            Duplicates
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.month}>
                            <TableCell>
                                <span className="flex flex-wrap gap-1">
                                    <Chip
                                        intent={STATUS_INTENT[row.status]}
                                        size="sm"
                                    >
                                        {row.status}
                                    </Chip>
                                    {row.partial ? (
                                        <Chip intent="neutral" size="sm">
                                            partial
                                        </Chip>
                                    ) : null}
                                </span>
                            </TableCell>
                            <TableCell>{monthLabel(row.month)}</TableCell>
                            <NumberCell value={row.transactionRows} />
                            <NumberCell value={row.cloudRows} />
                            <NumberCell value={row.pollenRows} />
                            <NumberCell value={row.forecastRows} />
                            <IssueCountCell
                                value={row.transactionEvidenceGaps}
                                vendors={row.transactionEvidenceProviders}
                                className={GROUP_BORDER}
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

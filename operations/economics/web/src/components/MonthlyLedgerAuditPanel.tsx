import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    type MonthlyLedgerAuditRow,
    type MonthlyLedgerAuditStatus,
    monthlyLedgerAuditRows,
} from "../lib/ledgerAudit";
import {
    type MonthFilterValue,
    monthLabel,
    type ValueFilter,
} from "../lib/months";
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
    {
        key: "transactionEvidenceGaps",
        value: (row) => row.transactionEvidenceGaps,
    },
    { key: "cloudEvidenceGaps", value: (row) => row.cloudEvidenceGaps },
    { key: "missingMappings", value: (row) => row.missingMappings },
    { key: "dashboardChecksDue", value: (row) => row.dashboardChecksDue },
    { key: "estimatedFx", value: (row) => row.estimatedFx },
    { key: "invalidRows", value: (row) => row.invalidRows },
    { key: "duplicateRows", value: (row) => row.duplicateRows },
];

function NumberCell({
    value,
    warn = false,
}: {
    value: number;
    warn?: boolean;
}) {
    return (
        <TableCell
            align="right"
            className={
                warn && value > 0 ? "text-intent-warning-text" : undefined
            }
        >
            {value.toLocaleString()}
        </TableCell>
    );
}

export function MonthlyLedgerAuditPanel({
    data,
    month,
    vendor = "all",
}: {
    data: Data;
    month: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const baseRows = useMemo(
        () => monthlyLedgerAuditRows(data, month, undefined, vendor),
        [data, month, vendor],
    );
    const { headerProps, rows } = useSortableRows(baseRows, SORT_COLUMNS, null);

    return (
        <section className="flex flex-col gap-3">
            <div>
                <h2 className="text-lg font-semibold text-theme-text-strong">
                    Monthly ledger audit
                </h2>
                <p className="text-sm text-theme-text-soft">
                    Structural integrity, evidence coverage, provider mapping,
                    and monthly provider-check coverage. Provider economics are
                    reconciled separately in Close. The current month stays
                    partial without hiding integrity or evidence problems.
                </p>
            </div>

            <TableScroller>
                <DataTable className="min-w-[1080px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("status")}
                            >
                                Status
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("month")}
                            >
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
                                Evidence gaps
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Registry
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
                                Transactions
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("cloudRows")}
                                align="right"
                            >
                                Cloud
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("pollenRows")}
                                align="right"
                            >
                                Pollen
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("transactionEvidenceGaps")}
                                className={GROUP_BORDER}
                                align="right"
                            >
                                <HeaderHint hint="Transactions whose invoice, receipt, statement, or reconciliation reference is not archived in Drive.">
                                    Wise
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("cloudEvidenceGaps")}
                                align="right"
                            >
                                <HeaderHint hint="Provider-months with cost activity but no archived Drive statement, invoice, billing export, or reconciliation source. Multiple model rows backed by one authoritative monthly export count once.">
                                    Cloud
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("missingMappings")}
                                className={GROUP_BORDER}
                                align="right"
                            >
                                Unmapped
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("dashboardChecksDue")}
                                align="right"
                            >
                                Provider due
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
                                <NumberCell
                                    value={row.transactionEvidenceGaps}
                                    warn
                                />
                                <NumberCell
                                    value={row.cloudEvidenceGaps}
                                    warn
                                />
                                <NumberCell value={row.missingMappings} warn />
                                <NumberCell
                                    value={row.dashboardChecksDue}
                                    warn
                                />
                                <TableCell className={GROUP_BORDER}>
                                    <Chip
                                        intent={
                                            row.estimatedFx
                                                ? "warning"
                                                : "neutral"
                                        }
                                        size="sm"
                                    >
                                        {row.estimatedFx
                                            ? "estimated"
                                            : "published"}
                                    </Chip>
                                </TableCell>
                                <NumberCell value={row.invalidRows} warn />
                                <NumberCell value={row.duplicateRows} warn />
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </section>
    );
}

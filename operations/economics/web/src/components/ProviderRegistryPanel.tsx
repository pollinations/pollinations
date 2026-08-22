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
    type MonthFilterValue,
    matchesValue,
    monthLabel,
    type ValueFilter,
} from "../lib/months";
import {
    type ProviderReviewRow,
    providerReviewRows,
} from "../lib/providerRegistry";
import type { Data } from "../types";
import {
    DataTable,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "./DataTable";

const SOURCE_LABELS: Record<ProviderReviewRow["sources"][number], string> = {
    transactions: "Transactions",
    cloud: "Cloud",
    pollen: "Pollen",
};

const DASHBOARD_INTENT = {
    recorded: "free",
    "reviewed gap": "warning",
    due: "warning",
    "no activity": "neutral",
    "not required": "neutral",
} as const;

const ACCOUNT_INTENT = {
    complete: "free",
    partial: "warning",
    unassigned: "danger",
    "no activity": "neutral",
    "not tracked": "neutral",
} as const;

const METERING_LABELS: Record<
    NonNullable<ProviderReviewRow["meteringBasis"]>,
    string
> = {
    direct: "direct API",
    capacity: "capacity",
    mixed: "mixed",
    internal: "Pollen",
    not_applicable: "n/a",
};

const SORT_COLUMNS: SortColumn<ProviderReviewRow>[] = [
    { key: "mapped", value: (row) => row.mapped },
    { key: "dashboardChecked", value: (row) => row.dashboardStatus },
    { key: "accountStatus", value: (row) => row.accountStatus },
    { key: "month", value: (row) => row.month },
    { key: "provider", value: (row) => row.provider },
    { key: "label", value: (row) => row.label },
    { key: "meteringBasis", value: (row) => row.meteringBasis },
    {
        key: "expectedAccounts",
        value: (row) =>
            row.expectedAccounts.map((account) => account.id).join(", "),
    },
    {
        key: "observedAccountIds",
        value: (row) => row.observedAccountIds.join(", "),
    },
    {
        key: "aliases",
        value: (row) => row.observedAliases.join(", "),
    },
    { key: "sources", value: (row) => row.sources.join(", ") },
    { key: "connector", value: (row) => row.connector },
];

export function ProviderRegistryPanel({
    data,
    month,
    vendor = "all",
}: {
    data: Data;
    month: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const baseRows = useMemo(
        () =>
            providerReviewRows(data, month).filter((row) =>
                matchesValue(row.provider, vendor),
            ),
        [data, month, vendor],
    );
    const missingMappings = baseRows.filter((row) => !row.mapped);
    const missingProviderIds = [
        ...new Set(missingMappings.map((row) => row.provider)),
    ].sort((a, b) => a.localeCompare(b));
    const checksDue = baseRows.filter((row) => row.dashboardStatus === "due");
    const reviewedGaps = baseRows.filter(
        (row) => row.dashboardStatus === "reviewed gap",
    );
    const accountGaps = baseRows.filter(
        (row) =>
            row.accountStatus === "partial" ||
            row.accountStatus === "unassigned",
    );
    const missingConnectorIds = new Set(
        baseRows
            .filter(
                (row) =>
                    row.mapped && row.monthlyReview && row.connector == null,
            )
            .map((row) => row.provider),
    );
    const { headerProps, rows } = useSortableRows(baseRows, SORT_COLUMNS, null);

    return (
        <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-theme-text-strong">
                        Provider registry
                    </h2>
                    <p className="text-sm text-theme-text-soft">
                        The manual source of truth and monthly provider
                        checklist. New Tinybird names are never accepted
                        silently.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Chip
                        intent={missingProviderIds.length ? "danger" : "free"}
                        size="sm"
                    >
                        {missingProviderIds.length} missing mappings
                    </Chip>
                    <Chip
                        intent={checksDue.length ? "warning" : "free"}
                        size="sm"
                    >
                        {checksDue.length} provider checks due
                    </Chip>
                    <Chip
                        intent={reviewedGaps.length ? "warning" : "free"}
                        size="sm"
                    >
                        {reviewedGaps.length} reviewed gaps
                    </Chip>
                    <Chip
                        intent={accountGaps.length ? "danger" : "free"}
                        size="sm"
                    >
                        {accountGaps.length} account gaps
                    </Chip>
                    <Chip
                        intent={missingConnectorIds.size ? "warning" : "free"}
                        size="sm"
                    >
                        {missingConnectorIds.size} missing procedures
                    </Chip>
                </div>
            </div>

            {missingProviderIds.length > 0 && (
                <div className="rounded-xl border border-intent-danger-border/40 bg-intent-danger-bg-light px-4 py-3 text-sm text-intent-danger-text">
                    Decide whether each missing Tinybird name is a new provider
                    or an alias of an existing one:{" "}
                    {missingProviderIds.join(", ")}.
                </div>
            )}

            <TableScroller>
                <DataTable className="min-w-[1480px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("mapped")}>
                                <HeaderHint hint="Every raw provider-like value from Tinybird must resolve through the manually maintained registry.">
                                    Mapping
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("dashboardChecked")}
                            >
                                <HeaderHint hint="Recorded means OP Cloud has a non-grant provider row for the month. Evidence archive completeness is audited separately. Reviewed gap means the provider was checked but surviving history cannot verify the amount. Due means the check is not complete.">
                                    Provider check
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("accountStatus")}>
                                <HeaderHint hint="For providers with several declared accounts, every active account must carry an explicit account ID on its provider evidence. Account names are not provider aliases.">
                                    Account check
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("month")}>
                                Month
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("provider")}>
                                Provider ID
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("label")}>
                                Provider
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("meteringBasis")}>
                                <HeaderHint hint="How provider cost should be compared with Pollen: direct APIs should closely match request metering; capacity and mixed clouds measure utilization variance; Pollen means internally priced; n/a has no model-cost comparison.">
                                    Metering
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("expectedAccounts")}
                            >
                                Expected accounts
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("observedAccountIds")}
                            >
                                Seen accounts
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("aliases")}>
                                Seen in Tinybird
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("sources")}>
                                Sources
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("connector")}>
                                Connector
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.month}|${row.provider}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>
                                    <Chip
                                        intent={
                                            row.mapped ? "neutral" : "danger"
                                        }
                                        size="sm"
                                    >
                                        {row.mapped ? "mapped" : "missing"}
                                    </Chip>
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        intent={
                                            DASHBOARD_INTENT[
                                                row.dashboardStatus
                                            ]
                                        }
                                        size="sm"
                                    >
                                        {row.dashboardStatus}
                                    </Chip>
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        intent={
                                            ACCOUNT_INTENT[row.accountStatus]
                                        }
                                        size="sm"
                                    >
                                        {row.accountStatus}
                                    </Chip>
                                </TableCell>
                                <TableCell>{monthLabel(row.month)}</TableCell>
                                <TableCell className="font-mono text-sm">
                                    {row.provider}
                                </TableCell>
                                <TableCell>{row.label}</TableCell>
                                <TableCell>
                                    {row.meteringBasis == null ? (
                                        "–"
                                    ) : (
                                        <Chip intent="neutral" size="sm">
                                            {METERING_LABELS[row.meteringBasis]}
                                        </Chip>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {row.expectedAccounts.length
                                        ? row.expectedAccounts
                                              .map(
                                                  (account) =>
                                                      `${account.label} (${account.id})`,
                                              )
                                              .join(", ")
                                        : "–"}
                                </TableCell>
                                <TableCell>
                                    {row.observedAccountIds.length
                                        ? row.observedAccountIds.join(", ")
                                        : "–"}
                                </TableCell>
                                <TableCell>
                                    {row.observedAliases.length
                                        ? row.observedAliases.join(", ")
                                        : "–"}
                                </TableCell>
                                <TableCell>
                                    {row.sources.length
                                        ? row.sources
                                              .map(
                                                  (source) =>
                                                      SOURCE_LABELS[source],
                                              )
                                              .join(", ")
                                        : "–"}
                                </TableCell>
                                <TableCell className="font-mono text-sm">
                                    {row.connector ??
                                        (!row.monthlyReview
                                            ? "not required"
                                            : "missing")}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </section>
    );
}

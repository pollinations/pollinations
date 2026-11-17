import {
    CardIcon,
    SproutIcon,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
} from "../components/DataTable";
import { Gauge } from "../components/EconomicsGauge";
import { useAmountDisplay } from "../components/ReconcilePro";
import { PairedStatCards } from "../components/StatCards";
import { type ApiCost, infrastructureReport } from "../lib/apiCosts";
import { hasVisibleAmount } from "../lib/format";
import { toolUsageRows } from "../lib/toolUsage";
import type { Data } from "../types";

const SORT_COLUMNS: readonly SortColumn<ApiCost>[] = [
    { key: "vendor", value: (row) => row.vendor },
    { key: "service", value: (row) => row.service },
    { key: "cashUsd", value: (row) => row.cashUsd },
    { key: "creditUsd", value: (row) => row.creditUsd },
    { key: "totalUsd", value: (row) => row.totalUsd },
];

export function InfrastructureTab({
    data,
    month,
    kind = "infrastructure",
}: {
    data: Data;
    month: string;
    kind?: "infrastructure" | "tools";
}) {
    const { fmtUsd, pro } = useAmountDisplay();
    const { rows, summary } = useMemo(
        () => infrastructureReport(data, month, kind),
        [data, month, kind],
    );
    const usage = toolUsageRows(data, month);
    const paid = usage.length
        ? usage.reduce((sum, row) => sum + row.paidPollenUsd, 0)
        : null;
    const quest = usage.length
        ? usage.reduce((sum, row) => sum + row.questPollenUsd, 0)
        : null;
    const { headerProps, rows: sortedRows } = useSortableRows(
        rows.filter(
            (row) =>
                pro ||
                hasVisibleAmount([row.cashUsd, row.creditUsd, row.totalUsd]),
        ),
        SORT_COLUMNS,
        { key: "totalUsd", direction: "desc" },
    );
    return (
        <div className="flex flex-col gap-4">
            <PairedStatCards
                cards={[
                    {
                        label:
                            kind === "tools"
                                ? "Attributed provider costs"
                                : "Infrastructure costs",
                        total: `${fmtUsd(summary?.totalUsd ?? null)} total`,
                        items: [
                            {
                                label: "Cash",
                                value: fmtUsd(summary?.cashUsd ?? null),
                            },
                            {
                                label: "Credits",
                                value: fmtUsd(summary?.creditUsd ?? null),
                            },
                        ],
                        detail: summary && (
                            <Gauge
                                className="mt-4 w-full"
                                palette="neutral"
                                left={summary.cashUsd}
                                leftLabel="Cash"
                                right={summary.creditUsd}
                                rightLabel="Credits"
                            />
                        ),
                    },
                    ...(kind === "tools"
                        ? [
                              {
                                  label: "Pollen used",
                                  items: [
                                      {
                                          label: (
                                              <span className="inline-flex items-center gap-1.5 text-paid-deep">
                                                  <CardIcon className="h-3.5 w-3.5" />
                                                  Paid
                                              </span>
                                          ),
                                          value: fmtUsd(
                                              paid == null || pro
                                                  ? paid
                                                  : Math.round(paid),
                                          ),
                                          valueClassName:
                                              "polli:text-paid-deep",
                                      },
                                      {
                                          label: (
                                              <span className="inline-flex items-center gap-1.5 text-tier-deep">
                                                  <SproutIcon className="h-3.5 w-3.5" />
                                                  Quest
                                              </span>
                                          ),
                                          value: fmtUsd(
                                              quest == null || pro
                                                  ? quest
                                                  : Math.round(quest),
                                          ),
                                          valueClassName:
                                              "polli:text-tier-deep",
                                      },
                                  ],
                                  detail: paid != null && quest != null && (
                                      <Gauge
                                          className="mt-4 w-full"
                                          left={paid}
                                          leftLabel="Paid"
                                          right={quest}
                                          rightLabel="Quest"
                                      />
                                  ),
                              },
                          ]
                        : []),
                ]}
            />
            {kind === "tools" && (
                <>
                    <p className="text-sm text-theme-text-soft">
                        Part of Infrastructure, already included in Runway and
                        Providers. Costs here cover E2B rental and Exa search;
                        shared Azure and Cloudflare bills cannot yet be
                        attributed to individual tools.
                    </p>
                    <ToolUsage data={data} month={month} />
                    <h3 className="font-semibold">Attributed service costs</h3>
                </>
            )}
            {kind === "infrastructure" && (
                <p className="text-sm text-theme-text-soft">
                    The same Infrastructure category as Runway, including tools
                    and sandboxes. Business and development tools belong to
                    Operations.
                </p>
            )}
            <TableScroller>
                <DataTable className="min-w-[600px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("vendor")}>
                                Provider
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("service")}>
                                Service
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("cashUsd")}
                            >
                                <HeaderHint hint="Cash-funded service costs for the month.">
                                    Cash
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("creditUsd")}
                            >
                                <HeaderHint hint="Provider credits used to cover service costs.">
                                    Credits
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("totalUsd")}
                            >
                                <HeaderHint hint="Cash plus used provider credits.">
                                    Total cost
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sortedRows.map((row) => (
                            <TableRow
                                key={JSON.stringify([row.vendor, row.service])}
                            >
                                <TableCell className="font-semibold">
                                    {row.vendor}
                                </TableCell>
                                <TableCell>{row.service}</TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(row.cashUsd)}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(row.creditUsd)}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(row.totalUsd)}
                                </TableCell>
                            </TableRow>
                        ))}
                        {!sortedRows.length && (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="py-8 text-center text-theme-text-soft"
                                >
                                    {rows.length
                                        ? "Recorded service amounts are all below $1."
                                        : "No attributed service costs recorded for this month."}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

const USAGE_COLUMNS: readonly SortColumn<
    ReturnType<typeof toolUsageRows>[number]
>[] = [
    { key: "vendor", value: (row) => row.vendor },
    { key: "service", value: (row) => row.service },
    { key: "requests", value: (row) => row.requests },
    { key: "paid", value: (row) => row.paidPollenUsd },
    { key: "quest", value: (row) => row.questPollenUsd },
];

function ToolUsage({ data, month }: { data: Data; month: string }) {
    const { fmtUsd, fmtNumber, pro } = useAmountDisplay();
    const usage = toolUsageRows(data, month);
    const { headerProps, rows } = useSortableRows(usage, USAGE_COLUMNS, {
        key: "paid",
        direction: "desc",
    });
    return (
        <>
            <p className="text-sm text-theme-text-soft">
                Billed sandbox leases and MCP calls from Gen events. Pollen
                consumed, not Stripe cash sales. Normal mode rounds to whole
                Pollen; Pro shows exact amounts.
            </p>
            <TableScroller>
                <DataTable className="min-w-[600px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("vendor")}>
                                Provider
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("service")}>
                                Product
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("requests")}
                            >
                                Billed events
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("paid")}
                            >
                                Paid Pollen
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("quest")}
                            >
                                Quest Pollen
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={`${row.vendor}:${row.service}`}>
                                <TableCell className="font-semibold">
                                    {row.vendor}
                                </TableCell>
                                <TableCell>{row.service}</TableCell>
                                <TableCell align="right" numeric>
                                    {fmtNumber(row.requests)}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(
                                        pro
                                            ? row.paidPollenUsd
                                            : Math.round(row.paidPollenUsd),
                                    )}
                                </TableCell>
                                <TableCell align="right" numeric>
                                    {fmtUsd(
                                        pro
                                            ? row.questPollenUsd
                                            : Math.round(row.questPollenUsd),
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                        {!rows.length && (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="py-8 text-center text-theme-text-soft"
                                >
                                    No billed tool or sandbox usage recorded for
                                    this month.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </>
    );
}

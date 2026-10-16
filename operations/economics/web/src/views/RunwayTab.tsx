import {
    CardIcon,
    Chip,
    cn,
    SproutIcon,
    TableBody,
    TableCell,
    TableDisclosureButton,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
} from "@pollinations/ui";
import {
    type ComponentProps,
    type ComponentType,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { DataTable, TableScroller } from "../components/DataTable";
import { Gauge, gaugeParts } from "../components/EconomicsGauge";
import {
    PairedStatCards,
    type StatPair,
    type StatTone,
} from "../components/StatCards";
import { categoryLabel, pnlSource } from "../lib/categories";
import type { ForecastPaymentTiming } from "../lib/forecastTerms";
import {
    fmtMonthDay,
    fmtNumber,
    fmtPeriod,
    fmtUnsignedPct,
    fmtUsd,
} from "../lib/format";
import { monthName } from "../lib/months";
import {
    buildRunway,
    type RunwayAssumption,
    type RunwayColumn,
    type RunwayMatrixRow,
} from "../lib/runway";
import { signedTone } from "../lib/tone";
import type { Data } from "../types";

function valueTone(value: number | null): StatTone {
    if (value == null || value === 0) return "base";
    return value > 0 ? "pos" : "neg";
}

export function runwayValueClass(value: number | null): string {
    if (value == null || value === 0) return "text-theme-text-soft";
    return signedTone(value);
}

export function runwayMonthLabel(month: string): string {
    const match = month.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!match) return month;
    return `${monthName(month)} ${match[1]}`;
}

export function runwayPeriodText({
    capped,
    exhaustedMonth,
    lastMonth,
}: {
    capped: boolean;
    exhaustedMonth: string | null;
    lastMonth: string | null;
}): string {
    if (exhaustedMonth) return runwayMonthLabel(exhaustedMonth);
    if (capped && lastMonth) return `${runwayMonthLabel(lastMonth)}+`;
    return "–";
}

export function fmtRunwayUsd(value: number | null | undefined): string {
    return fmtUsd(value);
}

export function fmtRunwayTableValue(value: number | null | undefined): string {
    return fmtNumber(value);
}

export function forecastMethodLabel(method: RunwayMatrixRow["forecastMethod"]) {
    if (method === "fixed") return "FIXED";
    if (method === "funded") return "FUNDED";
    if (method === "last") return "RUN RATE";
    if (method === "one_off") return "ONE-TIME";
    if (method === "mixed") return "MIXED";
    return null;
}

export function paymentTimingLabel(timing: ForecastPaymentTiming | null) {
    if (timing === "direct") return "DIRECT";
    if (timing === "prepaid") return "PREPAID";
    if (timing === "postpaid") return "POSTPAID";
    return null;
}

const FORECAST_BADGE_INTENT: Record<
    string,
    NonNullable<ComponentProps<typeof Chip>["intent"]>
> = {
    FIXED: "free",
    FUNDED: "news",
    "RUN RATE": "free",
    "ONE-TIME": "alpha",
    MIXED: "neutral",
    DIRECT: "news",
    PREPAID: "alpha",
    POSTPAID: "warning",
};

export function ForecastBadge({
    label,
    icon: Icon,
}: {
    label: string;
    icon?: ComponentType<{ className?: string }>;
}) {
    return (
        <Chip intent={FORECAST_BADGE_INTENT[label] ?? "neutral"} size="sm">
            {Icon ? <Icon className="h-3 w-3" /> : null}
            {label}
        </Chip>
    );
}

const SUMMARY_HELP: Record<string, string[]> = {
    Expenses: [
        "Main amount: costs funded with cash.",
        "Parentheses: additional costs covered by provider credits.",
    ],
    "Cash change": [
        "Actual: bank inflows minus outflows, including exchange-rate changes.",
        "Plan: expected cash increase or decrease that month.",
    ],
    "Cash balance": [
        "Past months: balance at the END of the month.",
        "To date: balance from the latest imported bank entries.",
        "Plan: expected balance at the END of the month.",
    ],
};

const REVENUE_HELP: Record<string, string[]> = {
    "Gross customer payments": [
        "Customer payments recorded by Stripe this month.",
        "Before fees, refunds and chargebacks.",
    ],
    "Stripe fees (including dispute fees)": [
        "Stripe fees charged this month, including dispute fees.",
        "May relate to older sales.",
    ],
    Refunds: ["Refunds recorded this month, including older purchases."],
    "Chargebacks / other reversals": [
        "Payments reversed this month.",
        "Dispute fees are listed under Stripe fees.",
    ],
    "stripe sales": [
        "Customer payments minus Stripe fees.",
        "Refunds and reversals appear separately.",
    ],
    "stripe refunds": ["Refunds and reversals recorded this month."],
};
function categoryExplanation(category: string): string[] {
    if (category === "revenue")
        return [
            "Sales minus fees, refunds and reversals, plus other revenue.",
            "Recorded sales may still be held in Stripe.",
        ];
    if (category === "balance_sheet")
        return [
            "Cash movements outside revenue and expenses, such as returned deposits.",
            "Future amounts are planned, not received yet.",
        ];
    return pnlSource(category) === "ledger"
        ? [
              "Provider costs for the month of usage.",
              "Parentheses: credit-funded costs. Plan: expected cash payments.",
          ]
        : [
              "Bank payments in this category, by payment month.",
              "Plan: expected payments.",
          ];
}

function rowExplanation(row: RunwayMatrixRow): string[] {
    if (REVENUE_HELP[row.vendor]) return REVENUE_HELP[row.vendor];
    if (row.vendor === "fx revaluation")
        return [
            "Change in the USD value of cash held in other currencies.",
            "No payment took place.",
        ];
    if (row.vendor === "pre-window movements")
        return [
            "Earlier bank movements included in the first reporting month.",
        ];
    if (pnlSource(row.category) === "ledger")
        return [
            "Provider costs for this month; parentheses show credit-funded usage.",
            "Plan: expected cash payments after available credits.",
        ];
    if (row.category === "balance_sheet")
        return categoryExplanation(row.category);
    return [
        "Bank payments or receipts recorded this month.",
        row.forecastMethod === "one_off"
            ? "One-time amount; no automatic repeat."
            : row.forecastMethod === "funded"
              ? "No recurring cash payment planned."
              : "Plan: expected payments or receipts.",
    ];
}

function CalculationInfo({ label, lines }: { label: string; lines: string[] }) {
    return (
        <Tooltip
            className="ml-2 font-normal normal-case tracking-normal"
            ariaLabel={`${label} calculation info`}
            tapEnabled
            maxWidth={300}
            content={
                <ul className="list-disc space-y-1 pl-4 whitespace-normal text-left">
                    {lines.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            }
        >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-theme-border text-[10px] text-theme-text-muted leading-none">
                i
            </span>
        </Tooltip>
    );
}

function ForecastVendor({ row }: { row: RunwayMatrixRow }) {
    const methodLabel = forecastMethodLabel(row.forecastMethod);
    const timingLabel = paymentTimingLabel(row.forecastPaymentTiming);
    return (
        <span className="inline-flex items-center gap-1.5">
            <span>
                {row.vendor === "stripe sales"
                    ? "Stripe sales after fees"
                    : row.vendor === "stripe refunds"
                      ? "Refunds and reversals"
                      : row.vendor}
            </span>
            <CalculationInfo label={row.vendor} lines={rowExplanation(row)} />
            {methodLabel && <ForecastBadge label={methodLabel} />}
            {timingLabel && <ForecastBadge label={timingLabel} />}
        </span>
    );
}

function ForecastValue({
    assumptions,
    value,
    issue,
}: {
    assumptions: RunwayAssumption[] | undefined;
    value: number | null;
    issue?: string;
}) {
    if (issue) return "–";
    if (!assumptions?.length) return fmtRunwayTableValue(value);
    return (
        <Tooltip
            triggerAs="span"
            content={
                <span className="block max-w-72">
                    {assumptions.map((assumption) => (
                        <span className="block" key={assumption.entry_id}>
                            <strong>{assumption.source || "unknown"}</strong>
                            {`: ${assumption.evidence || assumption.entry_id}`}
                        </span>
                    ))}
                </span>
            }
        >
            <span className="underline decoration-dotted decoration-theme-border underline-offset-2">
                {fmtRunwayTableValue(value)}
            </span>
        </Tooltip>
    );
}

function hasAmount(value: number | null | undefined): value is number {
    return value != null && Math.abs(value) >= 0.005;
}

// Usage paid with provider credits sits beside the cash figure in gray
// parentheses; a month funded only by credits shows just that figure.
function CreditAmount({ value }: { value: number | null | undefined }) {
    if (!hasAmount(value)) return null;
    return (
        <span className="ml-1 text-theme-text-muted">
            ({fmtRunwayTableValue(value)})
        </span>
    );
}

function showCash(cash: number | null, credit: number | null | undefined) {
    return cash == null || hasAmount(cash) || !hasAmount(credit);
}

const MONTH_COLUMN_CLASS = "min-w-28 whitespace-nowrap";

function monthKindLabel(kind: RunwayColumn["kind"]): string | null {
    if (kind === "actual") return null;
    if (kind === "current") return "To date";
    return "Plan";
}

type RunwayGroup = {
    category: string;
    rows: RunwayMatrixRow[];
    values: Record<string, number | null>;
    creditValues: Record<string, number>;
};

function groupRows(
    rows: RunwayMatrixRow[],
    columns: RunwayColumn[],
): RunwayGroup[] {
    const groups = new Map<string, RunwayGroup>();
    for (const row of rows) {
        const group: RunwayGroup = groups.get(row.category) ?? {
            category: row.category,
            rows: [],
            values: Object.fromEntries(columns.map((column) => [column.id, 0])),
            creditValues: Object.fromEntries(
                columns.map((column) => [column.id, 0]),
            ),
        };
        group.rows.push(row);
        for (const column of columns) {
            group.creditValues[column.id] += row.creditValues?.[column.id] ?? 0;
            const previous = group.values[column.id];
            group.values[column.id] =
                previous == null ||
                (column.kind === "forecast" && row.forecastIssue)
                    ? null
                    : previous + (row.values[column.id] ?? 0);
        }
        groups.set(row.category, group);
    }
    const revenue = groups.get("revenue");
    revenue?.rows.sort(
        (a, b) =>
            Number(b.vendor === "stripe sales") -
            Number(a.vendor === "stripe sales"),
    );
    for (const group of groups.values()) {
        for (const column of columns) {
            if (
                column.kind !== "forecast" &&
                group.rows.every((row) => row.values[column.id] == null)
            )
                group.values[column.id] = null;
        }
    }
    return [...groups.values()];
}

function SummaryRow({
    label,
    columns,
    value,
    credit,
    expanded,
    onToggle,
}: {
    label: string;
    columns: RunwayColumn[];
    value: (column: RunwayColumn) => number | null;
    credit?: (column: RunwayColumn) => number | null;
    expanded?: boolean;
    onToggle?: () => void;
}) {
    return (
        <TableRow className="runway-summary font-semibold">
            <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-surface-opaque">
                {onToggle ? (
                    <TableDisclosureButton
                        expanded={expanded ?? false}
                        onClick={onToggle}
                    >
                        {label}
                    </TableDisclosureButton>
                ) : (
                    label
                )}
                <CalculationInfo label={label} lines={SUMMARY_HELP[label]} />
            </TableCell>
            {columns.map((column) => (
                <TableCell
                    key={column.id}
                    align="right"
                    numeric
                    className={cn(
                        MONTH_COLUMN_CLASS,
                        runwayValueClass(value(column)),
                    )}
                >
                    {showCash(value(column), credit?.(column))
                        ? fmtRunwayTableValue(value(column))
                        : null}
                    <CreditAmount value={credit?.(column)} />
                </TableCell>
            ))}
        </TableRow>
    );
}

export function RunwayTab({ data, year }: { data: Data; year: string }) {
    const runway = useMemo(
        () =>
            buildRunway(
                data.opTransactions ?? [],
                new Date(),
                data.vendorLedger ?? [],
                data.privateConfig?.forecastRules,
                data.stripeSales ?? [],
            ),
        [
            data.vendorLedger,
            data.opTransactions,
            data.privateConfig?.forecastRules,
            data.stripeSales,
        ],
    );
    const columns = useMemo(
        () => runway.columns.filter((column) => column.month.startsWith(year)),
        [runway.columns, year],
    );
    const [expensesExpanded, setExpensesExpanded] = useState(true);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const scroller = tableScrollRef.current;
        if (scroller) {
            scroller.scrollLeft =
                `${year}-07` <= runway.currentMonth ? scroller.scrollWidth : 0;
        }
    }, [year, runway.currentMonth]);
    const groups = useMemo(
        () => groupRows(runway.rows, columns),
        [columns, runway.rows],
    );
    const next = runway.columns.find(
        (column) =>
            column.month > runway.currentMonth && column.kind === "forecast",
    );
    const nextPlanFacts = next
        ? runway.assumptions.filter(
              (assumption) => assumption.month.slice(0, 7) === next.month,
          ).length
        : 0;
    const nextChange =
        nextPlanFacts > 0 && next?.forecastComplete !== false
            ? (next?.netUsd ?? null)
            : null;
    const recordedDate =
        runway.latestTransactionDate ?? runway.openingBalanceDate;
    const [cashYear, cashMonth] = runway.currentMonth.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(cashYear, cashMonth, 0))
        .toISOString()
        .slice(0, 10);
    const balances = data.userBalances?.[0];
    const balanceSplit = balances
        ? gaugeParts(balances.paid_balance, balances.quest_balance)
        : null;
    const percent = (value: number | undefined) =>
        fmtUnsignedPct(value == null ? null : Math.round(value));
    const last = runway.columns.at(-1);
    const runwayTone: StatTone =
        runway.runwayMonths == null
            ? "base"
            : runway.runwayMonths <= 1
              ? "neg"
              : runway.runwayMonths <= 3
                ? "warn"
                : "base";

    return (
        <div className="flex flex-col gap-4">
            <PairedStatCards
                layout="rows"
                cards={[
                    {
                        label: "Cash",
                        items: [
                            {
                                label: (
                                    <span>
                                        Recorded
                                        {recordedDate
                                            ? ` · ${fmtMonthDay(recordedDate)}`
                                            : ""}
                                        <CalculationInfo
                                            label="Recorded bank cash"
                                            lines={[
                                                "All bank currencies combined in USD.",
                                                recordedDate
                                                    ? `Based on bank entries through ${fmtPeriod(recordedDate.slice(0, 10))}.`
                                                    : "Based on imported entries, not a live bank connection.",
                                            ]}
                                        />
                                    </span>
                                ),
                                value: fmtRunwayUsd(runway.currentCashUsd),
                                tone:
                                    runway.currentCashUsd != null &&
                                    runway.currentCashUsd < 0
                                        ? "neg"
                                        : "base",
                            },
                            {
                                label: (
                                    <span>
                                        Forecast · {fmtMonthDay(monthEnd)}
                                        <CalculationInfo
                                            label="Month-end cash"
                                            lines={[
                                                `Expected cash at the END of ${fmtPeriod(monthEnd)}.`,
                                                "Recorded bank cash plus remaining planned movements.",
                                                ...(runway.forecastTimingNote
                                                    ? [
                                                          runway.forecastTimingNote,
                                                      ]
                                                    : []),
                                            ]}
                                        />
                                    </span>
                                ),
                                value: fmtRunwayUsd(
                                    runway.projectedMonthEndCashUsd,
                                ),
                                tone:
                                    runway.projectedMonthEndCashUsd != null &&
                                    runway.projectedMonthEndCashUsd < 0
                                        ? "neg"
                                        : "base",
                            },
                        ],
                    },
                    {
                        label: "Outlook",
                        items: [
                            {
                                label: (
                                    <span>
                                        {next
                                            ? `${monthName(next.month)} cash change`
                                            : "Next cash change"}
                                        <CalculationInfo
                                            label="Next cash change"
                                            lines={[
                                                "Next month’s planned revenue minus expenses, plus cash adjustments.",
                                                "Provider credits are not cash payments.",
                                            ]}
                                        />
                                    </span>
                                ),
                                value: fmtRunwayUsd(nextChange),
                                tone: valueTone(nextChange),
                            },
                            {
                                label: (
                                    <span>
                                        {runway.runwayExhaustedMonth
                                            ? "Cash runs out"
                                            : "Cash runway"}
                                        <CalculationInfo
                                            label="Cash runway"
                                            lines={[
                                                "First month cash is projected to run out.",
                                                "“+” means cash lasts beyond the forecast shown.",
                                            ]}
                                        />
                                    </span>
                                ),
                                value: runwayPeriodText({
                                    capped: runway.runwayCapped,
                                    exhaustedMonth: runway.runwayExhaustedMonth,
                                    lastMonth: last?.month ?? null,
                                }),
                                tone: runwayTone,
                            },
                        ],
                    },
                    ...(balances
                        ? [
                              {
                                  label: "Pollen balance",
                                  total: balances.synced_at
                                      ? `Snapshot · ${fmtMonthDay(balances.synced_at)}`
                                      : "Snapshot date unavailable",
                                  detail: (
                                      <Gauge
                                          className="mt-4 w-full"
                                          left={balances.paid_balance}
                                          leftLabel="Paid"
                                          right={balances.quest_balance}
                                          rightLabel="Quest"
                                      />
                                  ),
                                  items: [
                                      {
                                          label: (
                                              <span className="inline-flex items-center gap-1.5 text-paid-deep">
                                                  <CardIcon className="h-3.5 w-3.5" />
                                                  Paid
                                                  <CalculationInfo
                                                      label="Paid Pollen"
                                                      lines={[
                                                          "Purchased Pollen still available in user wallets for the full catalog.",
                                                          "This is an unused balance, not monthly revenue or consumption.",
                                                      ]}
                                                  />
                                              </span>
                                          ),
                                          valueClassName:
                                              "polli:text-paid-deep",
                                          value: fmtRunwayTableValue(
                                              balances.paid_balance,
                                          ),
                                          detail: percent(
                                              balanceSplit?.leftPct,
                                          ),
                                      },
                                      {
                                          label: (
                                              <span className="inline-flex items-center gap-1.5 text-tier-deep">
                                                  <SproutIcon className="h-3.5 w-3.5" />
                                                  Quest
                                                  <CalculationInfo
                                                      label="Quest Pollen"
                                                      lines={[
                                                          "Earned or granted Pollen still available for the restricted catalog.",
                                                          "It is not revenue, although using it can incur provider costs.",
                                                      ]}
                                                  />
                                              </span>
                                          ),
                                          valueClassName:
                                              "polli:text-tier-deep",
                                          value: fmtRunwayTableValue(
                                              balances.quest_balance,
                                          ),
                                          detail: percent(
                                              balanceSplit
                                                  ? 100 -
                                                        Math.round(
                                                            balanceSplit.leftPct,
                                                        )
                                                  : undefined,
                                          ),
                                      },
                                  ],
                              } satisfies StatPair,
                          ]
                        : []),
                ]}
            />
            <TableScroller scrollRef={tableScrollRef}>
                <DataTable className="runway-table min-w-max">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell className="sticky left-0 z-20 min-w-48 bg-surface-opaque">
                                <span className="sr-only">Line item</span>
                            </TableHeaderCell>
                            {columns.map((column) => (
                                <TableHeaderCell
                                    key={column.id}
                                    align="right"
                                    className={MONTH_COLUMN_CLASS}
                                >
                                    <span className="inline-flex flex-col items-end">
                                        <span>{monthName(column.month)}</span>
                                        {monthKindLabel(column.kind) && (
                                            <span className="text-micro font-medium uppercase tracking-wide opacity-70">
                                                {monthKindLabel(column.kind)}
                                            </span>
                                        )}
                                    </span>
                                </TableHeaderCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        <SummaryRow
                            label="Cash change"
                            columns={columns}
                            value={(column) =>
                                column.forecastComplete === false
                                    ? null
                                    : column.netUsd
                            }
                        />
                        <SummaryRow
                            label="Cash balance"
                            columns={columns}
                            value={(column) => column.runningCashUsd}
                        />
                    </TableBody>
                    <TableBody className="runway-activity">
                        {groups
                            .filter((group) => group.category === "revenue")
                            .map((group) => (
                                <RunwayCategoryRows
                                    key={group.category}
                                    group={group}
                                    columns={columns}
                                />
                            ))}
                        <SummaryRow
                            label="Expenses"
                            columns={columns}
                            value={(column) =>
                                column.forecastComplete === false
                                    ? null
                                    : column.totalExpensesUsd
                            }
                            credit={(column) => column.totalCreditUsd}
                            expanded={expensesExpanded}
                            onToggle={() =>
                                setExpensesExpanded((current) => !current)
                            }
                        />
                        {expensesExpanded &&
                            groups
                                .filter(
                                    (group) =>
                                        group.category !== "revenue" &&
                                        group.category !== "balance_sheet",
                                )
                                .map((group) => (
                                    <RunwayCategoryRows
                                        key={group.category}
                                        group={group}
                                        columns={columns}
                                        nested
                                    />
                                ))}
                        {groups
                            .filter(
                                (group) => group.category === "balance_sheet",
                            )
                            .map((group) => (
                                <RunwayCategoryRows
                                    key={group.category}
                                    group={group}
                                    columns={columns}
                                />
                            ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

function RunwayCategoryRows({
    group,
    columns,
    nested = false,
}: {
    group: RunwayGroup;
    columns: RunwayColumn[];
    nested?: boolean;
}) {
    const [expanded, setExpanded] = useState(group.category === "revenue");

    return (
        <>
            <TableRow
                className={cn(
                    "runway-category",
                    nested ? "runway-subcategory" : "font-semibold",
                )}
            >
                <TableCell
                    className={cn(
                        "sticky left-0 z-10 whitespace-nowrap bg-surface-opaque",
                        nested && "pl-8",
                    )}
                >
                    <TableDisclosureButton
                        expanded={expanded}
                        onClick={() => setExpanded((current) => !current)}
                    >
                        {categoryLabel(group.category)}
                    </TableDisclosureButton>
                    <CalculationInfo
                        label={categoryLabel(group.category)}
                        lines={categoryExplanation(group.category)}
                    />
                </TableCell>
                {columns.map((column) => (
                    <TableCell
                        key={column.id}
                        align="right"
                        numeric
                        className={cn(
                            MONTH_COLUMN_CLASS,
                            runwayValueClass(group.values[column.id]),
                        )}
                    >
                        {showCash(
                            group.values[column.id],
                            group.creditValues[column.id],
                        )
                            ? fmtRunwayTableValue(group.values[column.id])
                            : null}
                        <CreditAmount value={group.creditValues[column.id]} />
                    </TableCell>
                ))}
            </TableRow>
            {expanded &&
                group.rows
                    .flatMap((row) =>
                        row.details?.length
                            ? row.details.map((detail) => ({
                                  ...row,
                                  vendor: detail.label,
                                  values: detail.values,
                                  forecastMethod: null,
                                  forecastPaymentTiming: null,
                              }))
                            : [row],
                    )
                    .map((row) => (
                        <TableRow
                            className="runway-detail"
                            key={`${row.category}|${row.vendor}`}
                        >
                            <TableCell
                                className={cn(
                                    "sticky left-0 z-10 whitespace-nowrap bg-surface-opaque text-theme-text-soft",
                                    nested ? "pl-12" : "pl-8",
                                )}
                            >
                                <ForecastVendor row={row} />
                            </TableCell>
                            {columns.map((column) => (
                                <TableCell
                                    key={column.id}
                                    align="right"
                                    numeric
                                    className={cn(
                                        MONTH_COLUMN_CLASS,
                                        runwayValueClass(row.values[column.id]),
                                    )}
                                >
                                    {showCash(
                                        row.values[column.id],
                                        row.creditValues?.[column.id],
                                    ) && (
                                        <ForecastValue
                                            assumptions={
                                                row.assumptions[column.id]
                                            }
                                            value={row.values[column.id]}
                                            issue={
                                                column.kind === "forecast"
                                                    ? row.forecastIssue
                                                    : undefined
                                            }
                                        />
                                    )}
                                    <CreditAmount
                                        value={row.creditValues?.[column.id]}
                                    />
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
        </>
    );
}

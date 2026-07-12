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
import { fmtMultiplier, fmtPct, fmtUnsignedPct, fmtUsd } from "../lib/format";
import {
    cashMarginPct,
    cashMarginUsd,
    type EconRow,
    providerCashCostUsd,
    providerGrantFundedUsd,
    providerUsageUsd,
    trueMarginPct,
} from "../lib/insights";
import { matchesValue, type ValueFilter } from "../lib/months";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "./DataTable";

export function visibleEconRows(
    rows: EconRow[],
    vendor: ValueFilter,
): EconRow[] {
    return rows.filter((row) => matchesValue(row.vendor, vendor));
}

export function hasEconActivity(row: EconRow): boolean {
    return [
        row.soldPaidUsd,
        row.soldQuestsUsd,
        providerCashCostUsd(row),
        providerGrantFundedUsd(row),
        row.questBurnUsd,
        cashMarginUsd(row),
    ].some((value) => value !== 0);
}

// Registry mispricing shows up as calibration far from 1.0× — the provider
// bills a multiple of what our own meter expected. Only severe drift (off by
// 2× or more, either direction) becomes a flag, so healthy rows stay quiet.
export const SEVERE_DRIFT = 2;
export function driftFlag(calib: number | null): string | null {
    if (calib == null) return null;
    if (calib >= SEVERE_DRIFT || calib <= 1 / SEVERE_DRIFT) {
        return `${fmtMultiplier(calib)} meter drift`;
    }
    return null;
}

// Minimal two-segment mix. No volume scaling — the dollar columns carry the
// amounts.
export function gaugeParts(paid: number, quests: number) {
    const total = paid + quests;
    if (total <= 0) return null;
    return {
        paidPct: (paid / total) * 100,
        questsPct: (quests / total) * 100,
    };
}

// Pollen-side sold value in price terms (paid revenue + quest usage at sold
// prices) — the like-for-like counterpart of providerUsageUsd for Match %.
// Never mix in questBurnUsd here: that is calibrated cost and already part of
// the provider side.
export function pollenSoldUsd(row: EconRow): number {
    return row.soldPaidUsd + row.soldQuestsUsd;
}

export function usageMatchPct(
    pollenUsageUsd: number,
    providerUsageUsd: number,
): number | null {
    const pollen = Math.max(0, pollenUsageUsd);
    const provider = Math.max(0, providerUsageUsd);
    const total = Math.max(pollen, provider);
    if (total <= 0) return null;
    return (Math.min(pollen, provider) / total) * 100;
}

export function Gauge({
    paid,
    quests,
    questLabel = "quest",
}: {
    paid: number;
    quests: number;
    questLabel?: string;
}) {
    const parts = gaugeParts(paid, quests);
    if (!parts) return <span className="text-theme-text-soft">–</span>;
    const label = `paid ${fmtUnsignedPct(parts.paidPct)} · ${questLabel} ${fmtUnsignedPct(parts.questsPct)}`;
    return (
        <div
            className="flex h-2 w-24 overflow-hidden rounded-sm"
            role="img"
            aria-label={label}
            title={label}
        >
            <div
                className="h-full bg-intent-success-text/70"
                style={{ width: `${parts.paidPct}%` }}
            />
            <div
                className="h-full bg-intent-warning-text/70"
                style={{ width: `${parts.questsPct}%` }}
            />
        </div>
    );
}

function marginTone(value: number) {
    return value >= 0 ? "text-intent-success-text" : "text-intent-danger-text";
}

function marginPctText(value: number | null) {
    return fmtPct(value).replace(/^\+/, "");
}

function marginPctTone(value: number | null) {
    if (value == null) return "text-theme-text-soft";
    return marginTone(value);
}

function usageMatchTone(value: number | null) {
    if (value == null) return "text-theme-text-soft";
    if (value >= 95) return "text-intent-success-text";
    if (value >= 80) return "text-intent-warning-text";
    return "text-intent-danger-text";
}

export function trueXStatTone(
    value: number | null,
    cashBreakEven: number | null,
): "base" | "pos" | "neg" | "warn" {
    if (value == null) return "base";
    if (value < 1) return "neg";
    if (cashBreakEven != null && value < cashBreakEven) return "warn";
    return "pos";
}

function providerFunding(
    row: EconRow,
): { paid: number; grants: number } | null {
    if (providerUsageUsd(row) <= 0) return null;
    return {
        paid: providerCashCostUsd(row),
        grants: providerGrantFundedUsd(row),
    };
}

const ECON_SOURCE_HINTS = {
    pollenTables: "op_pollen_api",
    providerTables: "op_pollen_api + op_cloud_api",
    fundingTables: "op_cloud_api",
    providerSources: "TB · API/CLI/BQ/HC",
    fundingSources: "API/CLI/BQ/HC",
};

// One economics table, two grains. The Vendors summary (grain "vendor") is
// exactly the Models table (grain "model") rolled up — same columns, same
// math, same thresholds — so the two tabs can never drift apart.
export function EconTable({
    rows,
    showFlags = false,
    showModel = false,
}: {
    rows: EconRow[];
    showFlags?: boolean;
    showModel?: boolean;
}) {
    const sourceHints = ECON_SOURCE_HINTS;
    const sortColumns = useMemo<SortColumn<EconRow>[]>(
        () => [
            { key: "vendor", value: (row) => row.vendor },
            { key: "model", value: (row) => row.model },
            { key: "modelType", value: () => "" },
            { key: "soldPaidUsd", value: (row) => row.soldPaidUsd },
            {
                key: "mix",
                value: (row) => {
                    const total = row.soldPaidUsd + row.soldQuestsUsd;
                    return total > 0 ? row.soldPaidUsd / total : null;
                },
            },
            { key: "questBurnUsd", value: (row) => row.questBurnUsd },
            {
                key: "cashCostPaidUsd",
                value: (row) => providerCashCostUsd(row),
            },
            {
                key: "providerFundingMix",
                value: (row) => {
                    const funding = providerFunding(row);
                    return funding && row.trueCostPaidUsd > 0
                        ? funding.paid / row.trueCostPaidUsd
                        : null;
                },
            },
            {
                key: "grantFundedUsd",
                value: (row) => providerGrantFundedUsd(row),
            },
            {
                key: "usageMatchPct",
                value: (row) =>
                    usageMatchPct(pollenSoldUsd(row), providerUsageUsd(row)),
            },
            { key: "cashMarginPct", value: (row) => cashMarginPct(row) },
            { key: "trueMarginPct", value: (row) => trueMarginPct(row) },
            { key: "cashMarginUsd", value: (row) => cashMarginUsd(row) },
            { key: "marginUsd", value: (row) => row.marginUsd },
            { key: "flags", value: (row) => row.flags.join(", ") },
        ],
        [],
    );
    const { headerProps, rows: sorted } = useSortableRows(rows, sortColumns);

    return (
        <div className="flex flex-col gap-3">
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            {showModel && (
                                <TableHeaderCell
                                    rowSpan={2}
                                    {...headerProps("model")}
                                >
                                    model
                                </TableHeaderCell>
                            )}
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("vendor")}
                            >
                                {showModel ? "provider" : "vendor"}
                            </TableHeaderCell>
                            {showModel && (
                                <TableHeaderCell
                                    rowSpan={2}
                                    {...headerProps("modelType")}
                                >
                                    type
                                </TableHeaderCell>
                            )}
                            <TableHeaderCell
                                colSpan={3}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Pollen
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("usageMatchPct")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Reconciliation between Pollen sold value (paid + quest, both at sold prices) and provider usage.",
                                        formula:
                                            "min(Pollen sold, Provider Cash + Credit) ÷ max(Pollen sold, Provider Cash + Credit)",
                                    }}
                                >
                                    Match %
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={3}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Provider
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                With Credit
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Without Credit
                            </TableHeaderCell>
                            {showFlags && (
                                <TableHeaderCell
                                    rowSpan={2}
                                    className={GROUP_BORDER}
                                    {...headerProps("flags")}
                                >
                                    <HeaderHint
                                        hint={{
                                            meaning:
                                                "Data-quality caveats: meter drift = provider bills a multiple of our meter (registry mispriced) · unwitnessed = pollen active but no provider row that month · unmetered = provider billed a month with no pollen · no meter = no provider rows at all.",
                                        }}
                                    >
                                        Flags
                                    </HeaderHint>
                                </TableHeaderCell>
                            )}
                        </TableRow>
                        <TableRow>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("soldPaidUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Revenue from paid users (hover a row for retained vs ecosystem split).",
                                        tables: sourceHints.pollenTables,
                                        sources: "TB",
                                    }}
                                >
                                    Paid
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="center"
                                {...headerProps("mix")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Usage mix — green is paid, amber is free quest.",
                                        tables: sourceHints.pollenTables,
                                        sources: "TB",
                                    }}
                                >
                                    Paid / Quest
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="left"
                                {...headerProps("questBurnUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "What free quest usage consumes — pure subsidy, earns nothing.",
                                        tables: sourceHints.pollenTables,
                                        sources: "TB",
                                    }}
                                >
                                    Quest
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("cashCostPaidUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Provider usage paid with real money. Includes paid-user and quest usage.",
                                        tables: sourceHints.providerTables,
                                        sources: sourceHints.providerSources,
                                        formula:
                                            "provider usage − provider Credit",
                                    }}
                                >
                                    Cash
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="center"
                                {...headerProps("providerFundingMix")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Provider funding mix — green is cash, amber is credit.",
                                        tables: sourceHints.fundingTables,
                                        sources: sourceHints.fundingSources,
                                        formula:
                                            "paid ÷ (paid + credit), credit ÷ (paid + credit)",
                                    }}
                                >
                                    Cash / Credit
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="left"
                                {...headerProps("grantFundedUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Provider usage paid with provider credit. Includes paid-user and quest usage.",
                                        tables: sourceHints.fundingTables,
                                        sources: sourceHints.fundingSources,
                                        formula:
                                            "provider usage × credit-funded share",
                                    }}
                                >
                                    Credit
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("cashMarginPct")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Margin after provider credit as a percentage of retained paid revenue.",
                                        formula:
                                            "(retained paid − cash) ÷ retained paid",
                                    }}
                                >
                                    Margin %
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("cashMarginUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Retained paid revenue minus total provider cash after credit.",
                                        formula: "retained paid − cash",
                                    }}
                                >
                                    Margin
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("trueMarginPct")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Margin before provider credit as a percentage of retained paid revenue.",
                                        formula:
                                            "(retained paid − provider usage) ÷ retained paid",
                                    }}
                                >
                                    Margin %
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("marginUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Retained paid revenue minus provider usage before credit. This shows margin if credit ended.",
                                        formula:
                                            "retained paid − provider usage",
                                    }}
                                >
                                    Margin
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(sorted, (row) =>
                            row.model == null
                                ? row.vendor
                                : `${row.vendor}|${row.model}`,
                        ).map(({ key, row }) => {
                            const funding = providerFunding(row);
                            const rowCashMarginUsd = cashMarginUsd(row);
                            const rowCashMarginPct = cashMarginPct(row);
                            const rowTrueMarginPct = trueMarginPct(row);
                            const rowPollenUsageUsd = pollenSoldUsd(row);
                            const rowProviderUsageUsd = providerUsageUsd(row);
                            const rowUsageMatchPct = usageMatchPct(
                                rowPollenUsageUsd,
                                rowProviderUsageUsd,
                            );
                            const drift = driftFlag(row.calib);
                            const flags = drift
                                ? [drift, ...row.flags]
                                : row.flags;
                            return (
                                <TableRow key={key}>
                                    {showModel && (
                                        <TableCell>{row.model}</TableCell>
                                    )}
                                    <TableCell>{row.vendor}</TableCell>
                                    {showModel && <TableCell />}
                                    <TableCell
                                        className={cn(
                                            "text-right text-intent-success-text",
                                            GROUP_BORDER,
                                        )}
                                    >
                                        <Tooltip
                                            triggerAs="span"
                                            content={
                                                <span className="block max-w-72">
                                                    retained{" "}
                                                    {fmtUsd(
                                                        row.retainedPaidUsd,
                                                    )}{" "}
                                                    · eco (byop + community
                                                    model){" "}
                                                    {fmtUsd(row.ecoPaidUsd)}
                                                </span>
                                            }
                                        >
                                            <span>
                                                {fmtUsd(row.soldPaidUsd)}
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center">
                                            <Gauge
                                                paid={row.soldPaidUsd}
                                                quests={row.soldQuestsUsd}
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-left text-intent-warning-text">
                                        {fmtUsd(row.questBurnUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={cn(
                                            GROUP_BORDER,
                                            usageMatchTone(rowUsageMatchPct),
                                        )}
                                    >
                                        <Tooltip
                                            triggerAs="span"
                                            content={
                                                <span className="block max-w-72">
                                                    Pollen usage{" "}
                                                    {fmtUsd(rowPollenUsageUsd)}{" "}
                                                    · provider usage{" "}
                                                    {fmtUsd(
                                                        rowProviderUsageUsd,
                                                    )}{" "}
                                                    · delta{" "}
                                                    {fmtUsd(
                                                        rowProviderUsageUsd -
                                                            rowPollenUsageUsd,
                                                    )}
                                                </span>
                                            }
                                        >
                                            <span>
                                                {fmtUnsignedPct(
                                                    rowUsageMatchPct,
                                                )}
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell
                                        className={cn(
                                            "text-right",
                                            GROUP_BORDER,
                                        )}
                                    >
                                        <Tooltip
                                            triggerAs="span"
                                            content={
                                                <span className="block max-w-72">
                                                    provider usage before credit{" "}
                                                    {fmtUsd(
                                                        providerUsageUsd(row),
                                                    )}{" "}
                                                    = cash{" "}
                                                    {fmtUsd(funding?.paid ?? 0)}{" "}
                                                    + credit{" "}
                                                    {fmtUsd(
                                                        funding?.grants ?? 0,
                                                    )}
                                                </span>
                                            }
                                        >
                                            <span>
                                                {fmtUsd(funding?.paid ?? 0)}
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center">
                                            {funding ? (
                                                <Gauge
                                                    paid={funding.paid}
                                                    quests={funding.grants}
                                                    questLabel="credit"
                                                />
                                            ) : (
                                                <span className="text-theme-text-soft">
                                                    –
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-left text-intent-warning-text">
                                        {funding ? fmtUsd(funding.grants) : "–"}
                                    </TableCell>
                                    <TableCell
                                        className={cn(
                                            "text-right",
                                            marginPctTone(rowCashMarginPct),
                                            GROUP_BORDER,
                                        )}
                                    >
                                        {marginPctText(rowCashMarginPct)}
                                    </TableCell>
                                    <TableCell
                                        className={cn(
                                            "text-right",
                                            marginTone(rowCashMarginUsd),
                                        )}
                                    >
                                        {fmtUsd(rowCashMarginUsd)}
                                    </TableCell>
                                    <TableCell
                                        className={cn(
                                            "text-right",
                                            GROUP_BORDER,
                                            marginPctTone(rowTrueMarginPct),
                                        )}
                                    >
                                        {marginPctText(rowTrueMarginPct)}
                                    </TableCell>
                                    <TableCell
                                        className={cn(
                                            "text-right",
                                            marginTone(row.marginUsd),
                                        )}
                                    >
                                        {fmtUsd(row.marginUsd)}
                                    </TableCell>
                                    {showFlags && (
                                        <TableCell className={GROUP_BORDER}>
                                            <div className="flex flex-wrap gap-1">
                                                {flags.map((flag) => (
                                                    <Chip
                                                        key={flag}
                                                        intent="warning"
                                                        size="sm"
                                                    >
                                                        ⚠ {flag}
                                                    </Chip>
                                                ))}
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

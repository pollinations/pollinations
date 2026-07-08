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
import { fmtMultiplier, fmtUnsignedPct, fmtUsd } from "../lib/format";
import { breakEvenMultiplier, type EconRow } from "../lib/insights";
import { costBasis } from "../lib/vendor-vocabulary";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "./DataTable";

export function isGpuVendor(vendor: string): boolean {
    return costBasis(vendor) === "gpu";
}

export function visibleEconRows(rows: EconRow[], vendor: string): EconRow[] {
    return rows.filter((row) => vendor === "all" || row.vendor === vendor);
}

export function hasEconActivity(row: EconRow): boolean {
    return [
        row.soldPaidUsd,
        row.soldQuestsUsd,
        row.trueCostPaidUsd,
        row.questBurnUsd,
        row.marginUsd,
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

export function Gauge({
    paid,
    quests,
    questLabel = "quests",
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

function trueXTone(value: number | null, cashBreakEven: number | null) {
    if (value == null) return "text-theme-text-soft";
    if (value < 1) return "text-intent-danger-text";
    if (cashBreakEven != null && value < cashBreakEven) {
        return "text-intent-warning-text";
    }
    return "text-intent-success-text";
}

// Same thresholds as the true × cell above, mapped to a stat-card tone: red
// loses cash on compute, amber loses after Stripe fees, green clears both.
export function trueXStatTone(
    value: number | null,
    cashBreakEven: number | null,
): "base" | "pos" | "neg" | "warn" {
    if (value == null) return "base";
    if (value < 1) return "neg";
    if (cashBreakEven != null && value < cashBreakEven) return "warn";
    return "pos";
}

function marginTone(value: number) {
    return value >= 0 ? "text-intent-success-text" : "text-intent-danger-text";
}

function providerFunding(
    row: EconRow,
): { paid: number; grants: number } | null {
    if (row.creditSharePct == null) return null;
    const grants = row.trueCostPaidUsd * (row.creditSharePct / 100);
    return {
        paid: row.trueCostPaidUsd - grants,
        grants,
    };
}

// One economics table, two grains. The Vendors summary (grain "vendor") is
// exactly the Models table (grain "model") rolled up — same columns, same
// math, same thresholds — so the two tabs can never drift apart.
export function EconTable({
    netRatio,
    rows,
    showFlags = false,
    showModel = false,
}: {
    netRatio: number | null;
    rows: EconRow[];
    showFlags?: boolean;
    showModel?: boolean;
}) {
    const cashBreakEven = breakEvenMultiplier(netRatio);
    const sortColumns = useMemo<SortColumn<EconRow>[]>(
        () => [
            { key: "vendor", value: (row) => row.vendor },
            { key: "model", value: (row) => row.model },
            { key: "soldPaidUsd", value: (row) => row.soldPaidUsd },
            {
                key: "mix",
                value: (row) => {
                    const total = row.soldPaidUsd + row.soldQuestsUsd;
                    return total > 0 ? row.soldPaidUsd / total : null;
                },
            },
            { key: "questBurnUsd", value: (row) => row.questBurnUsd },
            { key: "trueCostPaidUsd", value: (row) => row.trueCostPaidUsd },
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
                value: (row) => providerFunding(row)?.grants ?? null,
            },
            { key: "trueMultiplier", value: (row) => row.trueMultiplier },
            { key: "marginUsd", value: (row) => row.marginUsd },
            { key: "flags", value: (row) => row.flags.join(", ") },
        ],
        [],
    );
    const { headerProps, rows: sorted } = useSortableRows(rows, sortColumns);

    return (
        <div className="flex flex-col gap-3">
            <p className="text-xs text-theme-text-soft">
                Costs are provider-rate usage costs. Cash sent is reconciled
                separately.
            </p>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("vendor")}
                            >
                                vendor
                            </TableHeaderCell>
                            {showModel && (
                                <TableHeaderCell
                                    rowSpan={2}
                                    {...headerProps("model")}
                                >
                                    model
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
                                Economics
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
                                        tables: "pollen_monthly_api",
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
                                            "Usage mix — green is paid, amber is free quests.",
                                        tables: "pollen_monthly_api",
                                        sources: "TB",
                                    }}
                                >
                                    Paid / Quests
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="left"
                                {...headerProps("questBurnUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "What free quest usage cost us — pure subsidy, earns nothing.",
                                        tables: "pollen_monthly_api",
                                        sources: "TB",
                                    }}
                                >
                                    Quests
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("trueCostPaidUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Provider-rate cost of paid-user usage, whether funded by cash or credits. This is not cash sent.",
                                        tables: "pollen_monthly_api + provider_monthly_api",
                                        sources: "TB · API/CLI/BQ/manual",
                                        formula: "cost_paid × calibration",
                                    }}
                                >
                                    Provider Cost
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="center"
                                {...headerProps("providerFundingMix")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Provider funding mix — green is cash/prepaid paid, amber is grants.",
                                        tables: "provider_monthly_api + grants_api",
                                        sources: "API/CLI/BQ · HC",
                                        formula:
                                            "paid ÷ (paid + credit), credit ÷ (paid + credit)",
                                    }}
                                >
                                    Paid / Grants
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="left"
                                {...headerProps("grantFundedUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Provider Cost covered by grants for this row's scope.",
                                        tables: "provider_monthly_api + grants_api",
                                        sources: "API/CLI/BQ · HC",
                                        formula:
                                            "Provider Cost × grant-funded share",
                                    }}
                                >
                                    Grants
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("trueMultiplier")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Paid ÷ Provider Cost. Above 1× paid revenue covers the paid compute; below 1× it doesn't.",
                                        formula:
                                            "retained paid ÷ Provider Cost",
                                    }}
                                >
                                    Coverage ×
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("marginUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Paid − Provider Cost (compute only; Quests shown separately).",
                                        formula:
                                            "retained paid − Provider Cost",
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
                            const drift = driftFlag(row.calib);
                            const flags = drift
                                ? [drift, ...row.flags]
                                : row.flags;
                            return (
                                <TableRow key={key}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <span>{row.vendor}</span>
                                            {isGpuVendor(row.vendor) && (
                                                <Chip
                                                    data-theme="neutral"
                                                    intent="neutral"
                                                    size="sm"
                                                    title="time-based vendor — per-request margin here is allocation, not truth; see the GPU tab"
                                                >
                                                    gpu
                                                </Chip>
                                            )}
                                        </div>
                                    </TableCell>
                                    {showModel && (
                                        <TableCell>{row.model}</TableCell>
                                    )}
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
                                        className={cn(
                                            "text-right",
                                            GROUP_BORDER,
                                        )}
                                    >
                                        {fmtUsd(row.trueCostPaidUsd)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center">
                                            {funding ? (
                                                <Gauge
                                                    paid={funding.paid}
                                                    quests={funding.grants}
                                                    questLabel="grants"
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
                                            trueXTone(
                                                row.trueMultiplier,
                                                cashBreakEven,
                                            ),
                                            GROUP_BORDER,
                                        )}
                                    >
                                        {fmtMultiplier(row.trueMultiplier)}
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

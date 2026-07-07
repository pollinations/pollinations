import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
} from "@pollinations/ui";
import { useMemo } from "react";
import { fmtMultiplier, fmtUnsignedPct, fmtUsd } from "../lib/format";
import {
    breakEvenMultiplier,
    CALIB_DRIFT_ALARM,
    type EconRow,
} from "../lib/insights";
import {
    DataTable,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "./DataTable";

export function visibleEconRows(rows: EconRow[], vendor: string): EconRow[] {
    return rows.filter((row) => vendor === "all" || row.vendor === vendor);
}

// Minimal two-segment mix: paid vs quests share of pollen sold. No volume
// scaling — the dollar columns carry the amounts.
export function gaugeParts(paid: number, quests: number) {
    const total = paid + quests;
    if (total <= 0) return null;
    return {
        paidPct: (paid / total) * 100,
        questsPct: (quests / total) * 100,
    };
}

export function Gauge({ paid, quests }: { paid: number; quests: number }) {
    const parts = gaugeParts(paid, quests);
    if (!parts) return <span className="text-theme-text-soft">–</span>;
    const label = `paid ${fmtUnsignedPct(parts.paidPct)} · quests ${fmtUnsignedPct(parts.questsPct)}`;
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
                className="h-full bg-theme-text-soft/40"
                style={{ width: `${parts.questsPct}%` }}
            />
        </div>
    );
}

function CalibCell({
    calib,
    pollenPriced,
}: {
    calib: number | null;
    pollenPriced: boolean;
}) {
    if (pollenPriced) {
        return (
            <Tooltip
                triggerAs="span"
                content={
                    <span className="block max-w-72">
                        Pollen-priced — the provider rows are our own numbers
                        booked back, so calib is 1.00 by construction, not a
                        measurement.
                    </span>
                }
            >
                <span className="text-theme-text-soft">1.00× ·</span>
            </Tooltip>
        );
    }
    if (calib == null) {
        return (
            <span
                className="text-theme-text-soft"
                title="No provider rows in scope — true cost falls back to our metering."
            >
                –
            </span>
        );
    }
    const drift = calib - 1;
    if (Math.abs(drift) > CALIB_DRIFT_ALARM) {
        return (
            <span className="text-intent-danger-text">
                {fmtMultiplier(calib)} {drift > 0 ? "▲" : "▼"}
            </span>
        );
    }
    return <span>{fmtMultiplier(calib)}</span>;
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
            { key: "calib", value: (row) => row.calib },
            { key: "creditSharePct", value: (row) => row.creditSharePct },
            { key: "trueMultiplier", value: (row) => row.trueMultiplier },
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
                            <TableHeaderCell {...headerProps("vendor")}>
                                vendor
                            </TableHeaderCell>
                            {showModel && (
                                <TableHeaderCell {...headerProps("model")}>
                                    model
                                </TableHeaderCell>
                            )}
                            <TableHeaderCell {...headerProps("soldPaidUsd")}>
                                <HeaderHint hint="Pollen end users paid (price_paid). The retained/eco split is in the row tooltip.">
                                    sold (paid)
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("mix")}>
                                <HeaderHint hint="Mix of pollen sold: colored = paid, faded = quests.">
                                    paid / quests
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("questBurnUsd")}>
                                <HeaderHint hint="Free quest usage at true prices: cost_quests × calib. Pure subsidy — costs us, earns nothing.">
                                    quest burn
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("trueCostPaidUsd")}
                            >
                                <HeaderHint hint="What the provider actually charges for the paid usage: cost_paid × calib. With no meter (calib –) this is our metering unadjusted.">
                                    true cost
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("calib")}>
                                <HeaderHint
                                    hint={`Provider actual ÷ our metering, summed over the scope — a raw division, no smoothing. ▲/▼ past ±${Math.round(CALIB_DRIFT_ALARM * 100)}% = registry misprices this vendor. · = pollen-priced by construction.`}
                                >
                                    calib
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("creditSharePct")}>
                                <HeaderHint hint="Share of the vendor actual funded by granted credits — burn that costs no cash today but ends with the grant.">
                                    credit
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("trueMultiplier")}>
                                <HeaderHint hint="retained_paid ÷ true cost. Red < 1.00× loses cash on compute alone; amber < cash break-even loses after Stripe fees.">
                                    true ×
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("marginUsd")}>
                                <HeaderHint hint="retained_paid − true cost, compute only. Quest burn is shown separately, not subtracted.">
                                    margin
                                </HeaderHint>
                            </TableHeaderCell>
                            {showFlags && (
                                <TableHeaderCell {...headerProps("flags")}>
                                    <HeaderHint hint="Likely issues in the raw data: unwitnessed = pollen active but no provider row that month (calib reads low) · unmetered = provider billed a month with no pollen (calib reads high) · no meter = no provider rows at all.">
                                        flags
                                    </HeaderHint>
                                </TableHeaderCell>
                            )}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(sorted, (row) =>
                            row.model == null
                                ? row.vendor
                                : `${row.vendor}|${row.model}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{row.vendor}</TableCell>
                                {showModel && (
                                    <TableCell>{row.model}</TableCell>
                                )}
                                <TableCell>
                                    <Tooltip
                                        triggerAs="span"
                                        content={
                                            <span className="block max-w-72">
                                                retained{" "}
                                                {fmtUsd(row.retainedPaidUsd)} ·
                                                eco (byop + community model){" "}
                                                {fmtUsd(row.ecoPaidUsd)}
                                            </span>
                                        }
                                    >
                                        <span>{fmtUsd(row.soldPaidUsd)}</span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell>
                                    <Gauge
                                        paid={row.soldPaidUsd}
                                        quests={row.soldQuestsUsd}
                                    />
                                </TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {fmtUsd(row.questBurnUsd)}
                                </TableCell>
                                <TableCell>
                                    {fmtUsd(row.trueCostPaidUsd)}
                                </TableCell>
                                <TableCell>
                                    <CalibCell
                                        calib={row.calib}
                                        pollenPriced={row.pollenPriced}
                                    />
                                </TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {row.creditSharePct == null
                                        ? "–"
                                        : fmtUnsignedPct(row.creditSharePct)}
                                </TableCell>
                                <TableCell
                                    className={trueXTone(
                                        row.trueMultiplier,
                                        cashBreakEven,
                                    )}
                                >
                                    {fmtMultiplier(row.trueMultiplier)}
                                </TableCell>
                                <TableCell
                                    className={marginTone(row.marginUsd)}
                                >
                                    {fmtUsd(row.marginUsd)}
                                </TableCell>
                                {showFlags && (
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {row.flags.map((flag) => (
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
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

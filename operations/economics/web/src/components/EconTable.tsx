import {
    cn,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
} from "@pollinations/ui";
import { useMemo } from "react";
import { fmtMarginPct, fmtUnsignedPct, fmtUsd } from "../lib/format";
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
import { signedToneOrSoft, usageMatchTone } from "../lib/tone";
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
    providerUsageUsd: number | null,
): number | null {
    if (providerUsageUsd == null) return null;
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

function providerFunding(
    row: EconRow,
): { paid: number; grants: number } | null {
    const usage = providerUsageUsd(row);
    const paid = providerCashCostUsd(row);
    const grants = providerGrantFundedUsd(row);
    if (usage == null || usage <= 0 || paid == null || grants == null) {
        return null;
    }
    return { paid, grants };
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
    showModel = false,
}: {
    rows: EconRow[];
    showModel?: boolean;
}) {
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
                    return funding &&
                        row.trueCostPaidUsd != null &&
                        row.trueCostPaidUsd > 0
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
                                        tables: ECON_SOURCE_HINTS.pollenTables,
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
                                        tables: ECON_SOURCE_HINTS.pollenTables,
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
                                        tables: ECON_SOURCE_HINTS.pollenTables,
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
                                        tables: ECON_SOURCE_HINTS.providerTables,
                                        sources:
                                            ECON_SOURCE_HINTS.providerSources,
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
                                        tables: ECON_SOURCE_HINTS.fundingTables,
                                        sources:
                                            ECON_SOURCE_HINTS.fundingSources,
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
                                        tables: ECON_SOURCE_HINTS.fundingTables,
                                        sources:
                                            ECON_SOURCE_HINTS.fundingSources,
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
                                                        rowProviderUsageUsd ==
                                                            null
                                                            ? null
                                                            : rowProviderUsageUsd -
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
                                                        rowProviderUsageUsd,
                                                    )}{" "}
                                                    = cash{" "}
                                                    {fmtUsd(
                                                        funding?.paid ?? null,
                                                    )}{" "}
                                                    + credit{" "}
                                                    {fmtUsd(
                                                        funding?.grants ?? null,
                                                    )}
                                                </span>
                                            }
                                        >
                                            <span>
                                                {funding
                                                    ? fmtUsd(funding.paid)
                                                    : "–"}
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
                                            signedToneOrSoft(rowCashMarginPct),
                                            GROUP_BORDER,
                                        )}
                                    >
                                        {fmtMarginPct(rowCashMarginPct)}
                                    </TableCell>
                                    <TableCell
                                        className={cn(
                                            "text-right",
                                            signedToneOrSoft(rowCashMarginUsd),
                                        )}
                                    >
                                        {fmtUsd(rowCashMarginUsd)}
                                    </TableCell>
                                    <TableCell
                                        className={cn(
                                            "text-right",
                                            GROUP_BORDER,
                                            signedToneOrSoft(rowTrueMarginPct),
                                        )}
                                    >
                                        {fmtMarginPct(rowTrueMarginPct)}
                                    </TableCell>
                                    <TableCell
                                        className={cn(
                                            "text-right",
                                            signedToneOrSoft(row.marginUsd),
                                        )}
                                    >
                                        {fmtUsd(row.marginUsd)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}

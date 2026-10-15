import {
    CardIcon,
    Heading,
    SproutIcon,
    Surface,
    TabButton,
} from "@pollinations/ui";
import { useState } from "react";
import { fmtNumber, fmtPct, fmtUnsignedPct } from "../lib/format";
import { monthName, monthShift } from "../lib/months";
import { PRODUCT_STREAMS, type ProductMixMonth } from "../lib/productMix";
import { trendPercentChange } from "../lib/trends";
import { HeaderHint } from "./DataTable";

export function ProductMixCard({
    rows,
    questRows,
    activeMonth,
    previous,
    onInspect,
}: {
    rows: ProductMixMonth[];
    questRows: ProductMixMonth[];
    activeMonth: string | null;
    previous?: ProductMixMonth;
    onInspect: (month: string) => void;
}) {
    const [comparison, setComparison] = useState(false);
    const active = rows.find((row) => row.month === activeMonth) ?? rows.at(-1);
    const questActive = questRows.find((row) => row.month === active?.month);
    return (
        <Surface
            as="section"
            aria-label="Product mix"
            className="w-full min-w-0 max-w-4xl p-4 sm:p-5"
        >
            <div className="flex h-52 flex-col">
                <div className="flex h-12 shrink-0 items-start justify-between gap-2">
                    <Heading
                        as="h3"
                        size="card"
                        className="!text-base sm:!text-lg"
                    >
                        Product mix
                    </Heading>
                    <fieldset
                        className="flex shrink-0 gap-1"
                        aria-label="Product mix mode"
                    >
                        <TabButton
                            active={!comparison}
                            onClick={() => setComparison(false)}
                            size="xs"
                            variant="soft"
                        >
                            <span className="inline-flex items-center gap-1">
                                <CardIcon className="h-3 w-3 text-paid-deep" />
                                Paid only
                            </span>
                        </TabButton>
                        <TabButton
                            active={comparison}
                            onClick={() => setComparison(true)}
                            size="xs"
                            variant="soft"
                        >
                            <span className="inline-flex items-center gap-1">
                                <CardIcon className="h-3 w-3 text-paid-deep" />
                                Paid /{" "}
                                <SproutIcon className="h-3 w-3 text-tier-deep" />
                                Quest
                            </span>
                        </TabButton>
                    </fieldset>
                </div>
                <div className="min-h-0 flex-1 rounded-lg bg-black/10 p-2.5 dark:bg-white/5">
                    <h4 className="mb-2 text-sm font-semibold">
                        {active ? monthName(active.month) : "Months"}
                    </h4>
                    <table className="w-full text-xs tabular-nums">
                        <thead>
                            <tr className="text-theme-text-soft">
                                <th className="text-left font-normal">
                                    Product
                                </th>
                                <th className="text-right font-normal">
                                    {comparison ? (
                                        <span className="inline-flex items-center gap-1 border-b border-current text-paid-deep">
                                            <CardIcon className="h-3 w-3" />
                                            Paid used
                                        </span>
                                    ) : (
                                        "Consumed"
                                    )}
                                </th>
                                <th className="text-right font-normal">
                                    {comparison ? (
                                        <span className="inline-flex items-center gap-1 border-b border-dashed border-current text-tier-deep">
                                            <SproutIcon className="h-3 w-3" />
                                            Quest used
                                        </span>
                                    ) : (
                                        <HeaderHint hint="Paid Pollen consumed minus app and model creator shares, before provider costs. Requests with app creator earnings count under BYOP, including those using community models.">
                                            Retained
                                        </HeaderHint>
                                    )}
                                </th>
                                {!comparison && (
                                    <th className="text-right font-normal">
                                        vs{" "}
                                        {active
                                            ? monthName(
                                                  monthShift(active.month, -1),
                                              ).slice(0, 3)
                                            : "prior"}
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {PRODUCT_STREAMS.map((stream) => {
                                const value = active?.streams?.[stream.key];
                                const change = trendPercentChange(
                                    value?.retained,
                                    previous?.streams?.[stream.key]?.retained,
                                );
                                return (
                                    <tr key={stream.key}>
                                        <th
                                            scope="row"
                                            className="py-1.5 text-left font-normal"
                                        >
                                            <span
                                                style={{ color: stream.color }}
                                            >
                                                {stream.label}
                                            </span>
                                        </th>
                                        <td
                                            className={`pl-2 text-right ${comparison ? "text-paid-deep" : ""}`}
                                        >
                                            {fmtNumber(value?.consumed)}
                                        </td>
                                        <td className="pl-2 text-right">
                                            {comparison ? (
                                                <span className="text-tier-deep">
                                                    {fmtNumber(
                                                        questActive?.streams?.[
                                                            stream.key
                                                        ].consumed,
                                                    )}
                                                </span>
                                            ) : (
                                                <>
                                                    <strong>
                                                        {fmtNumber(
                                                            value?.retained,
                                                        )}
                                                    </strong>
                                                    <span className="ml-1 text-theme-text-soft">
                                                        {fmtUnsignedPct(
                                                            value &&
                                                                value.consumed >
                                                                    0
                                                                ? Math.round(
                                                                      (value.retained /
                                                                          value.consumed) *
                                                                          1000,
                                                                  ) / 10
                                                                : null,
                                                        )}
                                                    </span>
                                                </>
                                            )}
                                        </td>
                                        {!comparison && (
                                            <td
                                                className={`pl-2 text-right ${change == null || change === 0 ? "text-theme-text-soft" : change > 0 ? "text-outcome-positive-text" : "text-outcome-negative-text"}`}
                                            >
                                                {fmtPct(
                                                    change == null
                                                        ? null
                                                        : Math.round(
                                                              change * 10,
                                                          ) / 10,
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="mt-4">
                <div className="space-y-2">
                    {PRODUCT_STREAMS.map((stream) => {
                        const series = [
                            {
                                key: "paid",
                                dashed: false,
                                values: rows.map((row) =>
                                    comparison
                                        ? (row.streams?.[stream.key].consumed ??
                                          null)
                                        : (row.streams?.[stream.key].retained ??
                                          null),
                                ),
                            },
                            ...(comparison
                                ? [
                                      {
                                          key: "quest",
                                          dashed: true,
                                          values: rows.map(
                                              (row) =>
                                                  questRows.find(
                                                      (quest) =>
                                                          quest.month ===
                                                          row.month,
                                                  )?.streams?.[stream.key]
                                                      .consumed ?? null,
                                          ),
                                      },
                                  ]
                                : []),
                        ];
                        const max = Math.max(
                            1,
                            ...series
                                .flatMap((item) => item.values)
                                .filter(
                                    (value): value is number => value != null,
                                ),
                        );
                        const x = (i: number) =>
                            8 + (i * 284) / Math.max(1, rows.length - 1);
                        const y = (value: number) => 36 - (value / max) * 28;
                        return (
                            <div
                                key={stream.key}
                                className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-2"
                            >
                                <span className="pt-0.5 text-right text-[9px] tabular-nums text-theme-text-soft">
                                    {fmtNumber(max)}
                                </span>
                                <svg
                                    viewBox="0 0 300 44"
                                    className="h-11 w-full"
                                    preserveAspectRatio="none"
                                    role="img"
                                    aria-label={`${stream.label} ${comparison ? "Paid and Quest consumption" : "retained Pollen"} over time; independent scale`}
                                >
                                    <title>{stream.label}</title>
                                    <line
                                        x1="8"
                                        x2="292"
                                        y1="8"
                                        y2="8"
                                        stroke="currentColor"
                                        opacity="0.12"
                                    />
                                    {series.map(({ key, values, dashed }) =>
                                        values.map((value, i) =>
                                            value == null ? null : (
                                                <g
                                                    key={`${key}-${rows[i].month}`}
                                                >
                                                    {i > 0 &&
                                                        values[i - 1] !=
                                                            null && (
                                                            <line
                                                                x1={x(i - 1)}
                                                                y1={y(
                                                                    values[
                                                                        i - 1
                                                                    ] as number,
                                                                )}
                                                                x2={x(i)}
                                                                y2={y(value)}
                                                                stroke={
                                                                    stream.color
                                                                }
                                                                strokeWidth="2"
                                                                strokeDasharray={
                                                                    dashed
                                                                        ? "5 3"
                                                                        : undefined
                                                                }
                                                            />
                                                        )}
                                                    <circle
                                                        cx={x(i)}
                                                        cy={y(value)}
                                                        r={
                                                            rows[i].month ===
                                                            active?.month
                                                                ? 3.5
                                                                : 2
                                                        }
                                                        fill={
                                                            dashed
                                                                ? "var(--color-surface-opaque, #242321)"
                                                                : stream.color
                                                        }
                                                        stroke={stream.color}
                                                        strokeWidth={
                                                            dashed ? 1.5 : 0
                                                        }
                                                    >
                                                        <title>
                                                            {monthName(
                                                                rows[i].month,
                                                            )}
                                                            : {fmtNumber(value)}{" "}
                                                            {comparison
                                                                ? key
                                                                : "retained"}
                                                        </title>
                                                    </circle>
                                                </g>
                                            ),
                                        ),
                                    )}
                                </svg>
                            </div>
                        );
                    })}
                </div>
                <fieldset
                    className="ml-12 mt-2 flex justify-between"
                    aria-label="Inspect product mix month"
                >
                    {rows.map((row) => (
                        <button
                            key={row.month}
                            type="button"
                            onMouseEnter={() => onInspect(row.month)}
                            onFocus={() => onInspect(row.month)}
                            onClick={() => onInspect(row.month)}
                            aria-label={`Inspect product mix for ${monthName(row.month)} ${row.month.slice(0, 4)}`}
                            aria-pressed={row.month === active?.month}
                            className={`min-w-0 flex-1 rounded px-0 py-1 text-[9px] focus-visible:outline-2 ${row.month === active?.month ? "bg-black/10 dark:bg-white/5" : ""}`}
                        >
                            {monthName(row.month).slice(0, 3)}
                        </button>
                    ))}
                </fieldset>
            </div>
        </Surface>
    );
}

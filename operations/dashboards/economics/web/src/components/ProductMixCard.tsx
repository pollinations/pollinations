import { CardIcon, Heading, Surface } from "@pollinations/ui";
import { fmtExactNumber } from "../lib/format";
import { monthName, monthShift } from "../lib/months";
import { PRODUCT_STREAMS, type ProductMixMonth } from "../lib/productMix";
import { trendPercentChange } from "../lib/trends";
import { HeaderHint } from "./DataTable";
import { useAmountDisplay } from "./ReconcilePro";
import { TrendPlot } from "./TrendPlot";

export function ProductMixCard({
    rows,
    activeMonth,
    previous,
    onInspect,
}: {
    rows: ProductMixMonth[];
    activeMonth: string | null;
    previous?: ProductMixMonth;
    onInspect: (month: string) => void;
}) {
    const { fmtNumber, fmtPct } = useAmountDisplay();
    const active = rows.find((row) => row.month === activeMonth) ?? rows.at(-1);
    const slot = 528 / Math.max(1, rows.length);
    const x = (i: number) => 64 + slot * (i + 0.5);
    return (
        <Surface
            as="section"
            aria-label="Product mix"
            className="w-full min-w-0 max-w-4xl p-4 sm:p-5"
        >
            <div className="flex h-52 flex-col">
                <div className="flex h-12 shrink-0 items-start justify-between gap-2">
                    <Heading as="h3" size="card" className="min-w-0 !text-lg">
                        Product mix
                    </Heading>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-paid-deep">
                        <CardIcon className="h-3 w-3" />
                        Paid only
                    </span>
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
                                    <HeaderHint hint="Paid Pollen consumed minus app and model creator shares, before provider costs. Requests with app creator earnings count under BYOP, including those using community models.">
                                        Retained
                                    </HeaderHint>
                                </th>
                                <th className="text-right font-normal">
                                    vs{" "}
                                    {active
                                        ? monthName(
                                              monthShift(active.month, -1),
                                          ).slice(0, 3)
                                        : "prior"}
                                </th>
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
                                        <td className="pl-2 text-right">
                                            <strong>
                                                {fmtNumber(value?.retained)}
                                            </strong>
                                        </td>
                                        <td
                                            className={`pl-2 text-right ${change == null || change === 0 ? "text-theme-text-soft" : change > 0 ? "text-outcome-positive-text" : "text-outcome-negative-text"}`}
                                        >
                                            {fmtPct(
                                                change == null
                                                    ? null
                                                    : Math.round(change * 10) /
                                                          10,
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <TrendPlot
                rows={rows}
                activeMonth={active?.month ?? null}
                onInspect={onInspect}
                label="Product mix. Retained Pollen by month; independent product scales; select a month to inspect values."
            >
                {PRODUCT_STREAMS.map((stream, index) => {
                    const values = rows.map(
                        (row) => row.streams?.[stream.key].retained ?? null,
                    );
                    const max = Math.max(
                        1,
                        ...values.filter(
                            (value): value is number => value != null,
                        ),
                    );
                    const top = 24 + index * 64;
                    const y = (value: number) => top + 48 - (value / max) * 48;
                    return (
                        <g key={stream.key}>
                            <text
                                x="55"
                                y={top + 4}
                                textAnchor="end"
                                fill="currentColor"
                                fontSize="16"
                            >
                                {fmtNumber(max)}
                            </text>
                            <line
                                x1="64"
                                x2="592"
                                y1={top}
                                y2={top}
                                stroke="currentColor"
                                opacity="0.1"
                            />
                            {values.map((value, i) =>
                                value == null ? null : (
                                    <g key={rows[i].month}>
                                        {i > 0 && values[i - 1] != null && (
                                            <line
                                                x1={x(i - 1)}
                                                y1={y(values[i - 1] as number)}
                                                x2={x(i)}
                                                y2={y(value)}
                                                stroke={stream.color}
                                                strokeWidth="2.5"
                                            />
                                        )}
                                        <circle
                                            cx={x(i)}
                                            cy={y(value)}
                                            r={
                                                rows[i].month === active?.month
                                                    ? 5
                                                    : 3
                                            }
                                            fill={stream.color}
                                        >
                                            <title>
                                                {`${monthName(rows[i].month)}: ${fmtExactNumber(value)} retained`}
                                            </title>
                                        </circle>
                                    </g>
                                ),
                            )}
                        </g>
                    );
                })}
            </TrendPlot>
        </Surface>
    );
}

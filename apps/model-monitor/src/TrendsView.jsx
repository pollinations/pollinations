import { Chip, Heading, Surface } from "@pollinations/ui";
import { useMemo, useState } from "react";

// Theme-driven colours so the charts track light/dark mode.
const C = {
    ink: "var(--color-theme-text-strong)",
    soft: "var(--color-theme-text-soft, var(--color-theme-text-muted))",
    muted: "var(--color-theme-text-muted)",
    grid: "var(--color-theme-border, rgba(120,120,120,0.25))",
    danger: "var(--color-intent-danger-text)",
    success: "var(--color-intent-success-text)",
    warning: "var(--color-intent-warning-text)",
    accent: "var(--color-intent-news-text, var(--color-theme-text-strong))",
};

// 5xx-rate → severity colour. Tuned for the realistic 0–3% band.
function rateColor(r) {
    if (r <= 0.1) return C.success;
    if (r <= 0.5) return C.warning;
    return C.danger;
}

const fmt = (n) => n.toLocaleString("en-US");
const dayLabel = (s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const weekLabel = dayLabel;

// ---------------------------------------------------------------- Danger map
// Volume (log x) × 5xx rate (log y). Bubble area ∝ requests. Reuses the live
// health data already in the monitor — no extra fetch.
function DangerMap({ models }) {
    const points = useMemo(
        () =>
            models
                .map((m) => {
                    const s = m.stats;
                    if (!s) return null;
                    const ok = s.status_2xx || 0;
                    const e5 = s.errors_5xx || 0;
                    const denom = ok + e5;
                    if (denom < 50) return null;
                    return {
                        name: m.name,
                        type: m.type,
                        provider: m.provider || s.provider || "—",
                        requests: denom,
                        errors: e5,
                        rate: (e5 / denom) * 100,
                    };
                })
                .filter(Boolean),
        [models],
    );

    const [hover, setHover] = useState(null);

    if (points.length === 0) {
        return (
            <p className="m-0 text-sm text-theme-text-muted">
                Not enough live traffic in this window to plot the danger map.
            </p>
        );
    }

    const W = 1000;
    const H = 440;
    const padL = 66;
    const padR = 20;
    const padT = 18;
    const padB = 46;
    const maxReq = Math.max(...points.map((p) => p.requests));
    const xMin = Math.log10(50);
    const xMax = Math.log10(maxReq * 1.15);
    const yMax = Math.max(3, Math.max(...points.map((p) => p.rate)) * 1.05);
    const yFloor = 0.01;

    const xS = (req) =>
        padL + (W - padL - padR) * ((Math.log10(req) - xMin) / (xMax - xMin));
    const yS = (r) => {
        const v = Math.max(r, yFloor / 2);
        const lo = Math.log10(yFloor / 2);
        const hi = Math.log10(yMax);
        return (
            padT + (H - padT - padB) * (1 - (Math.log10(v) - lo) / (hi - lo))
        );
    };
    const rS = (req) => 4 + 26 * Math.sqrt(req / maxReq);

    const yTicks = [0.01, 0.1, 0.5, 1, 2, 3].filter((v) => v <= yMax);
    const xTicks = [100, 1e3, 1e4, 1e5, 1e6, 1e7].filter(
        (v) => Math.log10(v) >= xMin && Math.log10(v) <= xMax,
    );
    const sorted = [...points].sort((a, b) => b.requests - a.requests);

    // Danger zone: high volume (≥100k req) AND high rate (≥0.5%). Clamp the
    // start to the plot area so short windows (where max volume < 100k) don't
    // produce a negative-width rect.
    const dzX = Math.min(xS(1e5), W - padR);
    const dzWidth = Math.max(0, W - padR - dzX);

    return (
        <div className="relative">
            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-auto"
                aria-hidden="true"
            >
                {/* danger zone: high volume AND high rate */}
                {dzWidth > 0 && (
                    <rect
                        x={dzX}
                        y={padT}
                        width={dzWidth}
                        height={Math.max(0, yS(0.5) - padT)}
                        fill={C.danger}
                        opacity="0.06"
                    />
                )}
                {yTicks.map((v) => (
                    <g key={`y${v}`}>
                        <line
                            x1={padL}
                            y1={yS(v)}
                            x2={W - padR}
                            y2={yS(v)}
                            stroke={C.grid}
                            strokeWidth="1"
                        />
                        <text
                            x={padL - 8}
                            y={yS(v) + 3}
                            textAnchor="end"
                            fontSize="10"
                            fill={C.muted}
                        >
                            {v}%
                        </text>
                    </g>
                ))}
                {xTicks.map((v) => (
                    <text
                        key={`x${v}`}
                        x={xS(v)}
                        y={H - padB + 16}
                        textAnchor="middle"
                        fontSize="10"
                        fill={C.muted}
                    >
                        {v >= 1e6
                            ? `${v / 1e6}M`
                            : v >= 1e3
                              ? `${v / 1e3}k`
                              : v}
                    </text>
                ))}
                <text
                    x={W / 2}
                    y={H - 6}
                    textAnchor="middle"
                    fontSize="11"
                    fill={C.soft}
                >
                    requests (log) →
                </text>
                <text
                    x={16}
                    y={H / 2}
                    textAnchor="middle"
                    fontSize="11"
                    fill={C.soft}
                    transform={`rotate(-90 16 ${H / 2})`}
                >
                    5xx rate (log) →
                </text>
                {sorted.map((p) => (
                    // biome-ignore lint/a11y/noStaticElementInteractions: data-viz hover, chart is aria-hidden
                    <circle
                        key={`${p.type}-${p.name}`}
                        cx={xS(p.requests)}
                        cy={yS(p.rate)}
                        r={rS(p.requests)}
                        fill={rateColor(p.rate)}
                        fillOpacity={
                            hover && hover.name !== p.name ? 0.15 : 0.7
                        }
                        stroke={C.ink}
                        strokeWidth={hover?.name === p.name ? 2 : 1}
                        style={{
                            cursor: "pointer",
                            transition: "fill-opacity .1s",
                        }}
                        onMouseEnter={() => setHover(p)}
                        onMouseLeave={() => setHover(null)}
                    />
                ))}
            </svg>
            {hover && (
                <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-theme-surface-raised px-3 py-2 text-xs shadow-lg ring-1 ring-theme-border">
                    <div className="font-semibold text-theme-text-strong">
                        {hover.name}
                    </div>
                    <div className="text-theme-text-muted">
                        {hover.provider} · {hover.type}
                    </div>
                    <div className="text-theme-text-base">
                        {fmt(hover.requests)} req · {fmt(hover.errors)} errors
                    </div>
                    <div
                        className="font-semibold"
                        style={{ color: rateColor(hover.rate) }}
                    >
                        {hover.rate.toFixed(2)}% 5xx
                    </div>
                </div>
            )}
            <p className="mt-3 text-xs leading-normal text-theme-text-soft">
                Bubble area ∝ request volume. Top-right is the danger zone —
                high traffic <em>and</em> high error rate. Healthy models hug
                the bottom. Both axes are log-scaled. Live data for the selected
                window.
            </p>
        </div>
    );
}

// ---------------------------------------------------------- Daily timeline
function DailyTimeline({ daily }) {
    const [metric, setMetric] = useState("rate");
    const [hover, setHover] = useState(null);

    // Drop a leading partial day (volume far below the median).
    const rows = useMemo(() => {
        if (!daily?.length) return [];
        const vols = [...daily.map((d) => d.requests)].sort((a, b) => a - b);
        const med = vols[Math.floor(vols.length / 2)] || 0;
        return daily.filter((d) => d.requests > med * 0.25);
    }, [daily]);

    if (rows.length < 2) return null;

    const W = 1000;
    const H = 300;
    const padL = 58;
    const padR = 18;
    const padT = 20;
    const padB = 40;
    const valOf = (r) => (metric === "rate" ? r.rate : r.errors);
    const yMax = Math.max(...rows.map(valOf)) * 1.12 || 1;
    const maxReq = Math.max(...rows.map((r) => r.requests));
    const xS = (i) => padL + (W - padL - padR) * (i / (rows.length - 1));
    const yS = (v) => padT + (H - padT - padB) * (1 - v / yMax);

    let line = "";
    let area = `M${xS(0)} ${yS(valOf(rows[0]))} `;
    rows.forEach((r, i) => {
        const x = xS(i);
        const y = yS(valOf(r));
        line += `${i === 0 ? "M" : "L"}${x} ${y} `;
        if (i > 0) area += `L${x} ${y} `;
    });
    area += `L${xS(rows.length - 1)} ${H - padB} L${xS(0)} ${H - padB} Z`;
    const ticks = 4;

    return (
        <div className="relative">
            <div className="mb-3 flex gap-1.5">
                {[
                    { k: "rate", label: "Error rate %" },
                    { k: "errors", label: "Failed requests" },
                ].map(({ k, label }) => (
                    <button
                        key={k}
                        type="button"
                        onClick={() => setMetric(k)}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                            metric === k
                                ? "bg-theme-surface-sunken text-theme-text-strong ring-1 ring-theme-border"
                                : "text-theme-text-muted hover:text-theme-text-base"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-auto"
                aria-hidden="true"
            >
                {Array.from({ length: ticks + 1 }, (_, i) => {
                    const v = (yMax * i) / ticks;
                    return (
                        <g key={`grid-${v}`}>
                            <line
                                x1={padL}
                                y1={yS(v)}
                                x2={W - padR}
                                y2={yS(v)}
                                stroke={C.grid}
                                strokeWidth="1"
                            />
                            <text
                                x={padL - 8}
                                y={yS(v) + 3}
                                textAnchor="end"
                                fontSize="10"
                                fill={C.muted}
                            >
                                {metric === "rate"
                                    ? `${v.toFixed(2)}%`
                                    : Math.round(v).toLocaleString()}
                            </text>
                        </g>
                    );
                })}
                {rows.map((r, i) => {
                    const bh = (H - padT - padB) * (r.requests / maxReq) * 0.9;
                    return (
                        <rect
                            key={`v${r.day}`}
                            x={xS(i) - 6}
                            y={H - padB - bh}
                            width="12"
                            height={bh}
                            fill={C.muted}
                            opacity="0.12"
                        />
                    );
                })}
                {metric === "rate" && 0.5 < yMax && (
                    <>
                        <line
                            x1={padL}
                            y1={yS(0.5)}
                            x2={W - padR}
                            y2={yS(0.5)}
                            stroke={C.danger}
                            strokeWidth="1"
                            strokeDasharray="3 3"
                            opacity="0.5"
                        />
                        <text
                            x={W - padR}
                            y={yS(0.5) - 4}
                            textAnchor="end"
                            fontSize="9"
                            fill={C.danger}
                        >
                            incident threshold 0.5%
                        </text>
                    </>
                )}
                <path d={area} fill={C.accent} opacity="0.12" />
                <path d={line} fill="none" stroke={C.ink} strokeWidth="2.5" />
                {rows.map((r, i) => {
                    const spike = r.rate >= 0.4;
                    return (
                        <g key={`p${r.day}`}>
                            {/* biome-ignore lint/a11y/noStaticElementInteractions: data-viz hover, chart is aria-hidden */}
                            <circle
                                cx={xS(i)}
                                cy={yS(valOf(r))}
                                r={spike ? 5 : 3}
                                fill={spike ? C.danger : C.ink}
                                stroke="var(--color-app-bg, #fff)"
                                strokeWidth="1"
                                style={{ cursor: "pointer" }}
                                onMouseEnter={() => setHover(r)}
                                onMouseLeave={() => setHover(null)}
                            />
                            {spike && (
                                <text
                                    x={xS(i)}
                                    y={yS(valOf(r)) - 10}
                                    textAnchor="middle"
                                    fontSize="9"
                                    fontWeight="700"
                                    fill={C.danger}
                                >
                                    {r.rate.toFixed(2)}%
                                </text>
                            )}
                        </g>
                    );
                })}
                {rows.map((r, i) =>
                    i % 3 === 0 || i === rows.length - 1 ? (
                        <text
                            key={`l${r.day}`}
                            x={xS(i)}
                            y={H - padB + 16}
                            textAnchor="middle"
                            fontSize="10"
                            fill={C.muted}
                        >
                            {dayLabel(r.day)}
                        </text>
                    ) : null,
                )}
            </svg>
            {hover && (
                <div className="pointer-events-none absolute right-3 top-10 rounded-md bg-theme-surface-raised px-3 py-2 text-xs shadow-lg ring-1 ring-theme-border">
                    <div className="font-semibold text-theme-text-strong">
                        {dayLabel(hover.day)}
                    </div>
                    <div className="text-theme-text-base">
                        {fmt(hover.requests)} req · {fmt(hover.errors)} errors
                    </div>
                    <div
                        className="font-semibold"
                        style={{ color: rateColor(hover.rate) }}
                    >
                        {hover.rate.toFixed(3)}% 5xx
                    </div>
                </div>
            )}
            <p className="mt-3 text-xs leading-normal text-theme-text-soft">
                Baseline sits low; the tall spikes are incident days — hover for
                detail. Faint bars show daily request volume. A leading partial
                day is dropped.
            </p>
        </div>
    );
}

// -------------------------------------------------- Week-over-week Δ table
function WeekOverWeek({ providers, weeks }) {
    const rows = providers.filter((p) => p.totalRequests > 3000);
    if (!rows.length) return null;

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr className="text-xs uppercase text-theme-text-muted">
                        <th className="px-2 py-1.5 text-left font-medium">
                            provider
                        </th>
                        {weeks.map((w, i) => (
                            <th
                                key={w}
                                className="px-2 py-1.5 text-center font-medium"
                            >
                                wk {weekLabel(w)}
                                {i === 0 ? " (part)" : ""}
                            </th>
                        ))}
                        <th className="px-2 py-1.5 text-center font-medium">
                            Δ first→last
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((p) => {
                        const full = p.weekly
                            .map((w, i) => ({ ...w, i }))
                            .filter((w) => w.rate != null && w.i >= 1);
                        let delta = null;
                        if (full.length >= 2) {
                            delta = +(
                                full[full.length - 1].rate - full[0].rate
                            ).toFixed(2);
                        }
                        const better = delta != null && delta < 0;
                        const worse = delta != null && delta > 0;
                        return (
                            <tr
                                key={p.provider}
                                className="border-t border-theme-border"
                            >
                                <td className="px-2 py-1.5 font-medium text-theme-text-strong">
                                    {p.provider}
                                </td>
                                {p.weekly.map((w) => (
                                    <td
                                        key={w.week}
                                        className="px-2 py-1.5 text-center tabular-nums"
                                        style={{
                                            color:
                                                w.rate == null
                                                    ? C.muted
                                                    : rateColor(w.rate),
                                            fontWeight:
                                                w.rate != null && w.rate > 0.5
                                                    ? 600
                                                    : 400,
                                        }}
                                    >
                                        {w.rate == null
                                            ? "·"
                                            : `${w.rate.toFixed(2)}%`}
                                    </td>
                                ))}
                                <td className="px-2 py-1.5 text-center tabular-nums font-semibold">
                                    {delta == null ? (
                                        <span className="text-theme-text-muted">
                                            —
                                        </span>
                                    ) : (
                                        <span
                                            style={{
                                                color: better
                                                    ? C.success
                                                    : worse
                                                      ? C.danger
                                                      : C.muted,
                                            }}
                                        >
                                            {better ? "▼" : worse ? "▲" : "■"}{" "}
                                            {Math.abs(delta)}pp
                                        </span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <p className="mt-3 text-xs leading-normal text-theme-text-soft">
                Each provider's weekly 5xx rate, oldest→newest. Δ compares the
                latest full week vs the first. ▼ green = improving, ▲ red =
                worse.
            </p>
        </div>
    );
}

// ------------------------------------------ Per-provider daily small-multiples
function SmallMultiples({ providers, days }) {
    const rows = providers.filter((p) => p.totalRequests > 5000);
    const chartDays = days.slice(1); // drop leading partial day
    if (!rows.length) return null;

    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {rows.map((p) => {
                const series = chartDays.map(
                    (d) => p.daily.find((x) => x.day === d) || null,
                );
                const maxR = Math.max(
                    0.2,
                    ...series.filter(Boolean).map((s) => s.rate),
                );
                const W = 230;
                const H = 64;
                const pad = 4;
                const xS = (i) =>
                    pad + (W - 2 * pad) * (i / (chartDays.length - 1));
                const yS = (v) => H - pad - (H - 2 * pad) * (v / maxR);
                let path = "";
                let first = true;
                series.forEach((s, i) => {
                    if (!s) return;
                    path += `${first ? "M" : "L"}${xS(i).toFixed(1)} ${yS(
                        s.rate,
                    ).toFixed(1)} `;
                    first = false;
                });
                return (
                    <Surface key={p.provider} variant="card" className="p-2.5">
                        <div className="flex items-baseline justify-between">
                            <span className="text-xs font-semibold text-theme-text-strong">
                                {p.provider}
                            </span>
                            <span
                                className="text-xs font-semibold tabular-nums"
                                style={{ color: rateColor(p.avgRate) }}
                            >
                                {p.avgRate.toFixed(2)}%
                            </span>
                        </div>
                        <svg
                            viewBox={`0 0 ${W} ${H}`}
                            className="my-1 w-full h-auto"
                            aria-hidden="true"
                        >
                            <line
                                x1={pad}
                                y1={H - pad}
                                x2={W - pad}
                                y2={H - pad}
                                stroke={C.grid}
                                strokeWidth="1"
                            />
                            <path
                                d={path}
                                fill="none"
                                stroke={C.ink}
                                strokeWidth="1.6"
                            />
                            {series.map((s, i) =>
                                s && s.rate >= maxR * 0.6 && s.rate > 0.3 ? (
                                    <circle
                                        key={s.day}
                                        cx={xS(i)}
                                        cy={yS(s.rate)}
                                        r="2.5"
                                        fill={C.danger}
                                    />
                                ) : null,
                            )}
                        </svg>
                        <div className="text-[10px] text-theme-text-soft">
                            {p.totalRequests / 1e6 >= 1
                                ? `${(p.totalRequests / 1e6).toFixed(1)}M`
                                : `${Math.round(p.totalRequests / 1e3)}k`}{" "}
                            req · peak {maxR.toFixed(2)}%
                        </div>
                    </Surface>
                );
            })}
        </div>
    );
}

// ------------------------------------------ Worst offenders over time (top 5)
function WorstOffenders({ models, days }) {
    const ranked = useMemo(() => {
        return [...models]
            .filter((m) => m.totalRequests > 2000) // volume floor
            .sort((a, b) => b.avgRate - a.avgRate)
            .slice(0, 5);
    }, [models]);

    const chartDays = days.slice(1); // drop leading partial day
    if (!ranked.length) return null;

    return (
        <div className="flex flex-col gap-3">
            {ranked.map((m, idx) => {
                const series = chartDays.map(
                    (d) => m.daily.find((x) => x.day === d) || null,
                );
                const maxR = Math.max(
                    0.5,
                    ...series.filter(Boolean).map((s) => s.rate || 0),
                );
                const W = 720;
                const H = 56;
                const pad = 4;
                const xS = (i) =>
                    pad + (W - 2 * pad) * (i / (chartDays.length - 1));
                const yS = (v) => H - pad - (H - 2 * pad) * (v / maxR);
                let path = "";
                let first = true;
                series.forEach((s, i) => {
                    if (s?.rate == null) return;
                    path += `${first ? "M" : "L"}${xS(i).toFixed(1)} ${yS(
                        s.rate,
                    ).toFixed(1)} `;
                    first = false;
                });
                const peak = series
                    .filter(Boolean)
                    .reduce(
                        (mx, s) => (s.rate > (mx?.rate ?? -1) ? s : mx),
                        null,
                    );
                return (
                    <div
                        key={`${m.model}-${m.eventType}`}
                        className="flex items-center gap-3"
                    >
                        <div className="flex w-40 shrink-0 flex-col">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-theme-text-strong">
                                <span className="tabular-nums text-theme-text-muted">
                                    {idx + 1}.
                                </span>
                                {m.model}
                            </span>
                            <span className="text-xs text-theme-text-muted">
                                {m.provider} ·{" "}
                                {(m.eventType || "").replace("generate.", "")}
                            </span>
                        </div>
                        <svg
                            viewBox={`0 0 ${W} ${H}`}
                            className="h-12 flex-1"
                            aria-hidden="true"
                            preserveAspectRatio="none"
                        >
                            <line
                                x1={pad}
                                y1={H - pad}
                                x2={W - pad}
                                y2={H - pad}
                                stroke={C.grid}
                                strokeWidth="1"
                            />
                            <path
                                d={path}
                                fill="none"
                                stroke={rateColor(m.avgRate)}
                                strokeWidth="2"
                            />
                            {peak && (
                                <circle
                                    cx={xS(chartDays.indexOf(peak.day))}
                                    cy={yS(peak.rate)}
                                    r="3"
                                    fill={C.danger}
                                />
                            )}
                        </svg>
                        <div className="w-24 shrink-0 text-right">
                            <div
                                className="text-sm font-semibold tabular-nums"
                                style={{ color: rateColor(m.avgRate) }}
                            >
                                {m.avgRate.toFixed(2)}%
                            </div>
                            <div className="text-[10px] text-theme-text-soft">
                                peak {peak ? peak.rate.toFixed(1) : "0"}% ·{" "}
                                {m.totalRequests / 1e6 >= 1
                                    ? `${(m.totalRequests / 1e6).toFixed(1)}M`
                                    : `${Math.round(m.totalRequests / 1e3)}k`}
                            </div>
                        </div>
                    </div>
                );
            })}
            <p className="mt-1 text-xs leading-normal text-theme-text-soft">
                Top 5 individual models by average 5xx rate over the month (min
                2k requests, so a single bad request can't top the chart). Each
                line is that model's daily rate; the dot marks its worst day.
            </p>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section className="flex flex-col gap-2">
            <Heading as="h2" size="section" className="m-0">
                {title}
            </Heading>
            <Surface variant="card" className="p-4">
                {children}
            </Surface>
        </section>
    );
}

export function TrendsView({ models, trends, source, loading, error }) {
    return (
        <div className="flex flex-col gap-6">
            {error && (
                <p className="text-sm text-intent-danger-text">{error}</p>
            )}
            {loading && !trends && (
                <p className="text-sm text-theme-text-muted">
                    Loading 4-week trends…
                </p>
            )}

            {trends && (
                <>
                    <Section title="Daily error rate — last 4 weeks">
                        <DailyTimeline daily={trends.dailyOverall} />
                    </Section>
                    <Section title="Worst offenders — top 5 models by error rate">
                        <WorstOffenders
                            models={trends.byModel}
                            days={trends.days}
                        />
                    </Section>
                    <Section title="Week over week — who improved, who regressed">
                        <WeekOverWeek
                            providers={trends.byProvider}
                            weeks={trends.weeks}
                        />
                    </Section>
                    <Section title="Per-provider daily trends">
                        <SmallMultiples
                            providers={trends.byProvider}
                            days={trends.days}
                        />
                    </Section>
                </>
            )}

            <Section title="Danger map — volume × error rate (live)">
                <DangerMap models={models} />
            </Section>

            {trends && source === "snapshot" && (
                <Chip intent="neutral" size="sm">
                    Trends from bundled snapshot — deploy the model_trends pipe
                    for live data
                </Chip>
            )}
        </div>
    );
}

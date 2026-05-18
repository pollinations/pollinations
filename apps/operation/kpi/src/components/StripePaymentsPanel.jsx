import { AlertTriangle, Globe, ShieldAlert, Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
    getStripeCountryMismatch,
    getStripeCountryRevenue,
    getStripeFailedAttempts,
    getStripeTopBuyers,
} from "../api/tinybird";

const WINDOWS = [
    { label: "7d", value: 7 },
    { label: "15d", value: 15 },
    { label: "30d", value: 30 },
    { label: "90d", value: 90 },
];

function SectionHeader({ icon: Icon, title, subtitle, action }) {
    return (
        <div className="flex items-start justify-between mb-3">
            <div className="flex items-start gap-2">
                <Icon className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                    <h3 className="text-base font-semibold text-white">
                        {title}
                    </h3>
                    {subtitle && (
                        <p className="text-xs text-gray-400 mt-0.5 max-w-2xl">
                            {subtitle}
                        </p>
                    )}
                </div>
            </div>
            {action}
        </div>
    );
}

function Pill({ children, tone = "neutral" }) {
    const tones = {
        neutral: "bg-gray-800 text-gray-300",
        warn: "bg-amber-900/40 text-amber-300 border border-amber-800/60",
        danger: "bg-red-900/40 text-red-300 border border-red-800/60",
        ok: "bg-emerald-900/40 text-emerald-300 border border-emerald-800/60",
    };
    return (
        <span
            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${tones[tone]}`}
        >
            {children}
        </span>
    );
}

function formatUsd(n) {
    return `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// --- Revenue by country (billing vs card-issuing) -----------------------
function CountryRevenueTable({ rows, loading }) {
    // Aggregate across the days_back window: group by (billing, card)
    const byPair = {};
    for (const r of rows) {
        const key = `${r.billing_country || "—"}|${r.card_country || "—"}`;
        if (!byPair[key]) {
            byPair[key] = {
                billing: r.billing_country || "—",
                card: r.card_country || "—",
                revenue: 0,
                charges: 0,
            };
        }
        byPair[key].revenue += Number(r.revenue_usd || 0);
        byPair[key].charges += Number(r.charges || 0);
    }
    const pairs = Object.values(byPair)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15);

    const total = pairs.reduce((s, p) => s + p.revenue, 0);
    const cardCountryAvailable = pairs.some((p) => p.card !== "—");

    if (loading)
        return <div className="text-gray-500 text-sm py-4">Loading…</div>;
    if (!pairs.length)
        return (
            <div className="text-gray-500 text-sm py-4">
                No paid charges in this window.
            </div>
        );

    return (
        <div>
            {!cardCountryAvailable && (
                <div className="mb-3 text-xs text-amber-300/80 bg-amber-900/20 border border-amber-800/40 rounded px-3 py-2">
                    Card-issuing country is not yet populated for successful
                    charges. Add a <code>charge.succeeded</code> case to
                    <code> stripe-webhooks.ts</code> to start capturing it —
                    this column will then auto-populate.
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-gray-500 border-b border-gray-800">
                        <tr>
                            <th className="text-left py-2 font-medium">
                                Billing country
                                <span className="text-gray-600 normal-case font-normal ml-1">
                                    (self-reported)
                                </span>
                            </th>
                            <th className="text-left py-2 font-medium">
                                Card-issuing country
                                <span className="text-gray-600 normal-case font-normal ml-1">
                                    (verified)
                                </span>
                            </th>
                            <th className="text-right py-2 font-medium">
                                Revenue
                            </th>
                            <th className="text-right py-2 font-medium">
                                Charges
                            </th>
                            <th className="text-right py-2 font-medium">
                                % of total
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {pairs.map((p) => {
                            const mismatch =
                                p.billing !== "—" &&
                                p.card !== "—" &&
                                p.billing !== p.card;
                            return (
                                <tr
                                    key={`${p.billing}-${p.card}`}
                                    className="border-b border-gray-900 hover:bg-gray-900/30"
                                >
                                    <td className="py-2 font-mono">
                                        {p.billing}
                                    </td>
                                    <td className="py-2 font-mono">
                                        {p.card}
                                        {mismatch && (
                                            <span className="ml-2">
                                                <Pill tone="warn">
                                                    mismatch
                                                </Pill>
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2 text-right font-mono">
                                        {formatUsd(p.revenue)}
                                    </td>
                                    <td className="py-2 text-right text-gray-400">
                                        {p.charges}
                                    </td>
                                    <td className="py-2 text-right text-gray-400">
                                        {total > 0
                                            ? `${((p.revenue / total) * 100).toFixed(1)}%`
                                            : "—"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// --- Top buyers (smurf detector) ----------------------------------------
function TopBuyersTable({ rows, loading }) {
    if (loading)
        return <div className="text-gray-500 text-sm py-4">Loading…</div>;
    if (!rows.length)
        return (
            <div className="text-gray-500 text-sm py-4">
                No buyer above the threshold.
            </div>
        );

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-500 border-b border-gray-800">
                    <tr>
                        <th className="text-left py-2 font-medium">Email</th>
                        <th className="text-right py-2 font-medium">Charges</th>
                        <th className="text-right py-2 font-medium">
                            Stripe customers
                        </th>
                        <th className="text-right py-2 font-medium">Total</th>
                        <th className="text-left py-2 font-medium pl-3">
                            Billing countries
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => {
                        const ratio =
                            (r.distinct_stripe_customers || 0) /
                            Math.max(r.charges || 1, 1);
                        // High ratio = each charge generates a new Stripe Customer object
                        // (buyer isn't logged in or is rotating sessions) — smurf signal.
                        const tone =
                            ratio >= 0.7
                                ? "danger"
                                : ratio >= 0.4
                                  ? "warn"
                                  : "neutral";
                        const countries = r.billing_countries || [];
                        return (
                            <tr
                                key={r.email}
                                className="border-b border-gray-900 hover:bg-gray-900/30"
                            >
                                <td className="py-2 text-gray-200 font-mono text-xs">
                                    {r.email}
                                </td>
                                <td className="py-2 text-right font-mono">
                                    {r.charges}
                                </td>
                                <td className="py-2 text-right">
                                    <Pill tone={tone}>
                                        {r.distinct_stripe_customers}
                                    </Pill>
                                </td>
                                <td className="py-2 text-right font-mono">
                                    {formatUsd(r.total_usd)}
                                </td>
                                <td className="py-2 pl-3 text-xs text-gray-400">
                                    {countries.length > 4
                                        ? `${countries.slice(0, 4).join(", ")} +${countries.length - 4}`
                                        : countries.join(", ") || "—"}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// --- Country mismatch ---------------------------------------------------
function MismatchTable({ rows, loading }) {
    if (loading)
        return <div className="text-gray-500 text-sm py-4">Loading…</div>;
    if (!rows.length)
        return (
            <div className="text-gray-500 text-sm py-4">
                No mismatches in this window.
            </div>
        );

    const top = rows.slice(0, 10);
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-500 border-b border-gray-800">
                    <tr>
                        <th className="text-left py-2 font-medium">Status</th>
                        <th className="text-left py-2 font-medium">Billing</th>
                        <th className="text-left py-2 font-medium">Card</th>
                        <th className="text-right py-2 font-medium">Charges</th>
                        <th className="text-right py-2 font-medium">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {top.map((r, i) => (
                        <tr
                            key={`${r.status}-${r.billing_country}-${r.card_country}-${i}`}
                            className="border-b border-gray-900 hover:bg-gray-900/30"
                        >
                            <td className="py-2">
                                {r.status === "paid" ? (
                                    <Pill tone="ok">paid</Pill>
                                ) : (
                                    <Pill tone="danger">failed</Pill>
                                )}
                            </td>
                            <td className="py-2 font-mono">
                                {r.billing_country}
                            </td>
                            <td className="py-2 font-mono">{r.card_country}</td>
                            <td className="py-2 text-right font-mono">
                                {r.charges}
                            </td>
                            <td className="py-2 text-right font-mono text-gray-400">
                                {formatUsd(r.usd)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// --- Failed attempts (carding) ------------------------------------------
function FailedAttemptsTable({ rows, loading }) {
    if (loading)
        return <div className="text-gray-500 text-sm py-4">Loading…</div>;
    if (!rows.length)
        return (
            <div className="text-gray-500 text-sm py-4">
                No failed attempts in this window.
            </div>
        );

    // Aggregate across days, group by (billing, card, decline_code)
    const grouped = {};
    for (const r of rows) {
        const key = `${r.billing_country || "—"}|${r.card_country || "—"}|${r.decline_code || r.error_code || "—"}`;
        if (!grouped[key]) {
            grouped[key] = {
                billing: r.billing_country || "—",
                card: r.card_country || "—",
                decline: r.decline_code || r.error_code || "—",
                attempts: 0,
                amount: 0,
            };
        }
        grouped[key].attempts += Number(r.attempts || 0);
        grouped[key].amount += Number(r.attempted_usd || 0);
    }
    const top = Object.values(grouped)
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 10);

    const totalAttempts = top.reduce((s, r) => s + r.attempts, 0);
    const totalAmount = top.reduce((s, r) => s + r.amount, 0);

    return (
        <div>
            <div className="mb-2 text-xs text-gray-400">
                {totalAttempts.toLocaleString()} attempts ·{" "}
                {formatUsd(totalAmount)} attempted (top 10 patterns)
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-gray-500 border-b border-gray-800">
                        <tr>
                            <th className="text-left py-2 font-medium">
                                Billing
                            </th>
                            <th className="text-left py-2 font-medium">Card</th>
                            <th className="text-left py-2 font-medium">
                                Decline
                            </th>
                            <th className="text-right py-2 font-medium">
                                Attempts
                            </th>
                            <th className="text-right py-2 font-medium">
                                Amount
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {top.map((r, i) => (
                            <tr
                                key={`${r.billing}-${r.card}-${r.decline}-${i}`}
                                className="border-b border-gray-900 hover:bg-gray-900/30"
                            >
                                <td className="py-2 font-mono">{r.billing}</td>
                                <td className="py-2 font-mono">{r.card}</td>
                                <td className="py-2 text-xs text-gray-400">
                                    {r.decline}
                                </td>
                                <td className="py-2 text-right font-mono">
                                    {r.attempts}
                                </td>
                                <td className="py-2 text-right font-mono text-gray-400">
                                    {formatUsd(r.amount)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function StripePaymentsPanel() {
    const [daysBack, setDaysBack] = useState(15);
    const [revenue, setRevenue] = useState([]);
    const [buyers, setBuyers] = useState([]);
    const [mismatch, setMismatch] = useState([]);
    const [failed, setFailed] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([
            getStripeCountryRevenue(daysBack),
            getStripeTopBuyers(daysBack, 5, 25),
            getStripeCountryMismatch(daysBack, 50),
            getStripeFailedAttempts(daysBack),
        ]).then(([r, b, m, f]) => {
            if (cancelled) return;
            setRevenue(r);
            setBuyers(b);
            setMismatch(m);
            setFailed(f);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [daysBack]);

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 mb-8">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">
                        Stripe payments forensics
                    </h2>
                    <p className="text-xs text-gray-400 mt-1 max-w-3xl">
                        Stripe stores two different "countries" per charge: what
                        the buyer typed (billing) vs what the card network
                        confirms (card-issuing). They often disagree — surfacing
                        both makes resellers, smurfs and carding probes visible
                        instead of hidden behind a single misleading map.
                    </p>
                </div>
                <div className="flex gap-1 bg-gray-950 border border-gray-800 rounded p-1">
                    {WINDOWS.map((w) => (
                        <button
                            type="button"
                            key={w.value}
                            onClick={() => setDaysBack(w.value)}
                            className={`text-xs px-2 py-1 rounded ${
                                daysBack === w.value
                                    ? "bg-gray-800 text-white"
                                    : "text-gray-400 hover:text-gray-200"
                            }`}
                        >
                            {w.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <SectionHeader
                        icon={Globe}
                        title="Revenue by country"
                        subtitle="Side-by-side: self-reported billing country vs the country that issued the card actually used. Disagreements are flagged."
                    />
                    <CountryRevenueTable rows={revenue} loading={loading} />
                </div>

                <div>
                    <SectionHeader
                        icon={Users}
                        title="Top buyers (smurf watch)"
                        subtitle="Emails with 5+ charges in this window. A high ratio of distinct Stripe Customer objects per email signals throwaway sessions / reseller behaviour."
                    />
                    <TopBuyersTable rows={buyers} loading={loading} />
                </div>

                <div>
                    <SectionHeader
                        icon={AlertTriangle}
                        title="Country mismatch"
                        subtitle="Charges where billing country ≠ card-issuing country, split by status. Failed-and-mismatched is the classic carding signature."
                    />
                    <MismatchTable rows={mismatch} loading={loading} />
                </div>

                <div>
                    <SectionHeader
                        icon={ShieldAlert}
                        title="Failed attempts"
                        subtitle="Carding probes — declined charges grouped by decline reason. These are not lost revenue; treat as fraud signal volume."
                    />
                    <FailedAttemptsTable rows={failed} loading={loading} />
                </div>
            </div>
        </div>
    );
}

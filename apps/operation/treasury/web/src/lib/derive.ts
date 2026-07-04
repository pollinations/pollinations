// Client-side reconciliation — the "minus" that replaced the forager burn engine
// (removed 2026-07-04). Crossing tables lives in the frontend now, not Tinybird:
// sum invoices vs sum payments per (provider, month), show the delta.
//
// This is deliberately a per-month sum, not the old greedy nearest-date matcher.
// Its one blind spot is payment timing: an invoice issued in June but paid in July
// shows June as unpaid and July as overpaid. Acceptable at this volume; eyeball it.

import type { CoverageRow, GapRow, InvoiceRow, PaymentTxRow } from "../types";

const FX = 1.14; // EUR→USD, mirrors forager cfg fx_eur_usd default
const TOL_PCT = 0.02;
const TOL_USD = 2;

function invoiceUsd(r: InvoiceRow): number {
    return r.currency === "EUR" ? r.amount * FX : r.amount;
}

function reconStatus(invoice: number, payment: number): string {
    if (invoice < 1 && payment < 1) return "quiet";
    if (invoice < 1) return "missing_invoice";
    if (payment < 1) return "missing_payment";
    const tol = Math.max(TOL_PCT * Math.max(invoice, payment), TOL_USD);
    return Math.abs(invoice - payment) <= tol ? "ok" : "amount_mismatch";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One verdict per (provider, month): summed invoices vs summed payments. */
export function deriveCoverage(
    invoices: InvoiceRow[],
    payments: PaymentTxRow[],
): CoverageRow[] {
    const inv = new Map<string, number>();
    for (const r of invoices) {
        if (!r.provider || !r.period_month) continue;
        const key = `${r.period_month}|${r.provider}`;
        inv.set(key, (inv.get(key) ?? 0) + invoiceUsd(r));
    }

    const pay = new Map<string, number>();
    for (const r of payments) {
        const month = (r.paid_at ?? "").slice(0, 7);
        if (!r.provider || !month) continue; // skip unmatched counterparties
        const key = `${month}|${r.provider}`;
        pay.set(key, (pay.get(key) ?? 0) + r.amount_eur * FX);
    }

    const rows: CoverageRow[] = [];
    for (const key of new Set([...inv.keys(), ...pay.keys()])) {
        const [month, provider] = key.split("|");
        const invoice_usd = round2(inv.get(key) ?? 0);
        const payment_usd = round2(pay.get(key) ?? 0);
        rows.push({
            month,
            provider,
            status: reconStatus(invoice_usd, payment_usd),
            invoice_usd,
            payment_usd,
        });
    }
    return rows.sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.provider.localeCompare(b.provider),
    );
}

/** Coverage rows that don't reconcile — invoice minus payment, mismatches only. */
export function deriveGaps(coverage: CoverageRow[]): GapRow[] {
    return coverage
        .filter((r) => r.status !== "ok" && r.status !== "quiet")
        .map((r) => ({
            ...r,
            delta_usd: round2(r.invoice_usd - r.payment_usd),
        }));
}

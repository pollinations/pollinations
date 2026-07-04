import { FIXTURES } from "../fixtures";
import type {
    Data,
    GrantRow,
    InvoiceRow,
    MeterMonthlyRow,
    PaymentTxRow,
    ProviderAliasRow,
    RunRow,
    UsageMonthlyRow,
} from "../types";
import { deriveCoverage, deriveGaps } from "./derive";

export const fixturesMode = (): boolean =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("fixtures");

export class TbError extends Error {
    status: number;

    constructor(pipe: string, status: number) {
        super(`${pipe}: HTTP ${status}`);
        this.status = status;
    }
}

export async function fetchPipe<T>(pipe: string): Promise<T[]> {
    if (fixturesMode()) return (FIXTURES[pipe] ?? []) as T[];

    const res = await fetch(`/api/pipes/${encodeURIComponent(pipe)}`);
    if (!res.ok) throw new TbError(pipe, res.status);

    const body = (await res.json()) as { data: T[] };
    return body.data;
}

type RawMeterMonthlyRow = {
    cash_burn_usd?: number;
    cash_src?: string;
    cost_usd?: number;
    credit_burn_usd?: number;
    credit_src?: string;
    funding?: string;
    month: string;
    provider: string;
    source?: string;
};

function combineSource(current: string, next: string) {
    if (!next) return current;
    if (!current) return next;
    return current === next ? current : "mixed";
}

export function normalizeMeterMonthly(rows: RawMeterMonthlyRow[]) {
    const byProviderMonth = new Map<string, MeterMonthlyRow>();

    for (const row of rows) {
        const key = `${row.month}|${row.provider}`;
        const current =
            byProviderMonth.get(key) ??
            ({
                month: row.month,
                provider: row.provider,
                cash_burn_usd: 0,
                cash_src: "",
                credit_burn_usd: 0,
                credit_src: "",
            } satisfies MeterMonthlyRow);

        if (
            row.cash_burn_usd !== undefined ||
            row.credit_burn_usd !== undefined
        ) {
            current.cash_burn_usd += Number(row.cash_burn_usd ?? 0);
            current.cash_src = combineSource(
                current.cash_src,
                row.cash_src ?? "",
            );
            current.credit_burn_usd += Number(row.credit_burn_usd ?? 0);
            current.credit_src = combineSource(
                current.credit_src,
                row.credit_src ?? "",
            );
        } else {
            const amount = Number(row.cost_usd ?? 0);
            if (row.funding === "credit") {
                current.credit_burn_usd += amount;
                current.credit_src = combineSource(
                    current.credit_src,
                    row.source ?? "",
                );
            } else {
                current.cash_burn_usd += amount;
                current.cash_src = combineSource(
                    current.cash_src,
                    row.source ?? "",
                );
            }
        }

        byProviderMonth.set(key, current);
    }

    return [...byProviderMonth.values()].map((row) => ({
        ...row,
        cash_burn_usd: Math.round(row.cash_burn_usd * 100) / 100,
        credit_burn_usd: Math.round(row.credit_burn_usd * 100) / 100,
    }));
}

export async function loadAll(): Promise<Data> {
    const [
        invoices,
        paymentsTx,
        meterMonthly,
        grants,
        usageMonthly,
        runs,
        providerAliases,
    ] = await Promise.all([
        fetchPipe<InvoiceRow>("invoices_ep"),
        fetchPipe<PaymentTxRow>("payments_ep"),
        fetchPipe<RawMeterMonthlyRow>("meter_monthly_ep"),
        fetchPipe<GrantRow>("grants_ep"),
        fetchPipe<UsageMonthlyRow>("usage_ep"),
        fetchPipe<RunRow>("runs_ep"),
        fetchPipe<ProviderAliasRow>("provider_aliases_ep"),
    ]);

    // Reconciliation is derived client-side (the invoice−payment minus), not a
    // Tinybird pipe — the burn engine was removed 2026-07-04.
    const coverage = deriveCoverage(invoices, paymentsTx);
    const gaps = deriveGaps(coverage);

    return {
        coverage,
        gaps,
        invoices,
        paymentsTx,
        meterMonthly: normalizeMeterMonthly(meterMonthly),
        grants,
        usageMonthly,
        runs,
        providerAliases,
    };
}

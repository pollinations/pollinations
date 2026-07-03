import { FIXTURES } from "../fixtures";
import type {
    BalanceRow,
    CashMonthlyRow,
    CoverageRow,
    Data,
    GapRow,
    GrantRow,
    InvoiceRow,
    RunRow,
    UsageMonthlyRow,
} from "../types";

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

export async function loadAll(): Promise<Data> {
    const [
        coverage,
        gaps,
        invoices,
        cashMonthly,
        grants,
        balances,
        usageMonthly,
        runs,
    ] = await Promise.all([
        fetchPipe<CoverageRow>("coverage_ep"),
        fetchPipe<GapRow>("gaps_ep"),
        fetchPipe<InvoiceRow>("invoices_ep"),
        fetchPipe<CashMonthlyRow>("payments_monthly_ep"),
        fetchPipe<GrantRow>("grants_ep"),
        fetchPipe<BalanceRow>("balances_ep"),
        fetchPipe<UsageMonthlyRow>("usage_ep"),
        fetchPipe<RunRow>("runs_ep"),
    ]);

    return {
        coverage,
        gaps,
        invoices,
        cashMonthly,
        grants,
        balances,
        usageMonthly,
        runs,
    };
}

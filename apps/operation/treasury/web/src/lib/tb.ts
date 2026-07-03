import { TB_HOST } from "../config";
import { FIXTURES } from "../fixtures";
import type {
    BalanceRow,
    CashMonthlyRow,
    CoverageRow,
    Data,
    GapRow,
    GrantRow,
    InvoiceRow,
    ProviderMonthRow,
    RunRow,
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

export async function fetchPipe<T>(pipe: string, token: string): Promise<T[]> {
    if (fixturesMode()) return (FIXTURES[pipe] ?? []) as T[];

    const res = await fetch(`${TB_HOST}/v0/pipes/${pipe}.json`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new TbError(pipe, res.status);

    const body = (await res.json()) as { data: T[] };
    return body.data;
}

export async function loadAll(token: string): Promise<Data> {
    const [
        coverage,
        gaps,
        invoices,
        cashMonthly,
        grants,
        balances,
        providerMonths,
        runs,
    ] = await Promise.all([
        fetchPipe<CoverageRow>("coverage_ep", token),
        fetchPipe<GapRow>("gaps_ep", token),
        fetchPipe<InvoiceRow>("invoices_ep", token),
        fetchPipe<CashMonthlyRow>("cash_monthly_ep", token),
        fetchPipe<GrantRow>("grants_ep", token),
        fetchPipe<BalanceRow>("balances_ep", token),
        fetchPipe<ProviderMonthRow>("provider_month_ep", token),
        fetchPipe<RunRow>("runs_ep", token),
    ]);

    return {
        coverage,
        gaps,
        invoices,
        cashMonthly,
        grants,
        balances,
        providerMonths,
        runs,
    };
}

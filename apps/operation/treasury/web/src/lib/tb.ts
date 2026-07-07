import { FIXTURES } from "../fixtures";
import type {
    Data,
    GrantRow,
    PollenMonthlyRow,
    ProviderMonthlyRow,
    RevenueMonthlyRow,
    RunRow,
    TransactionRow,
} from "../types";

export const fixturesMode = (): boolean =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("fixtures");

export class TbError extends Error {
    pipe: string;
    status: number;

    constructor(pipe: string, status: number) {
        super(`${pipe}: HTTP ${status}`);
        this.pipe = pipe;
        this.status = status;
    }
}

export async function fetchPipe<T>(pipe: string): Promise<T[]> {
    if (fixturesMode()) {
        const rows = FIXTURES[pipe];
        if (!rows) throw new Error(`Missing fixture for pipe ${pipe}`);
        return rows as T[];
    }

    const res = await fetch(`/api/pipes/${encodeURIComponent(pipe)}`);
    if (!res.ok) throw new TbError(pipe, res.status);

    const body = (await res.json()) as { data: T[] };
    return body.data;
}

export async function loadAll(): Promise<Data> {
    const [
        transactions,
        providerMonthly,
        pollenMonthly,
        grants,
        runs,
        revenueMonthly,
    ] = await Promise.all([
        fetchPipe<TransactionRow>("transactions_api"),
        fetchPipe<ProviderMonthlyRow>("provider_monthly_api"),
        fetchPipe<PollenMonthlyRow>("pollen_monthly_api"),
        fetchPipe<GrantRow>("grants_api"),
        fetchPipe<RunRow>("ingest_runs_api"),
        fetchPipe<RevenueMonthlyRow>("revenue_monthly_api"),
    ]);

    return {
        transactions,
        providerMonthly,
        pollenMonthly,
        grants,
        runs,
        revenueMonthly,
    };
}

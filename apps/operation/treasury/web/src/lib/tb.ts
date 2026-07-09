import { FIXTURES } from "../fixtures";
import type {
    Data,
    GpuRunRow,
    GrantRow,
    OpCloudRow,
    OpPollenRow,
    OpTransactionRow,
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

async function fetchOptionalPipe<T>(pipe: string): Promise<T[]> {
    try {
        return await fetchPipe<T>(pipe);
    } catch (error) {
        if (
            (error instanceof TbError && error.status === 404) ||
            (fixturesMode() &&
                error instanceof Error &&
                error.message.includes("Missing fixture"))
        ) {
            return [];
        }
        throw error;
    }
}

export async function loadAll(): Promise<Data> {
    const [
        transactions,
        providerMonthly,
        pollenMonthly,
        opTransactions,
        opCloud,
        opPollen,
        grants,
        runs,
        revenueMonthly,
        gpuRuns,
    ] = await Promise.all([
        fetchPipe<TransactionRow>("transactions_api"),
        fetchPipe<ProviderMonthlyRow>("provider_monthly_api"),
        fetchPipe<PollenMonthlyRow>("pollen_monthly_api"),
        fetchOptionalPipe<OpTransactionRow>("op_transactions_api"),
        fetchOptionalPipe<OpCloudRow>("op_cloud_api"),
        fetchOptionalPipe<OpPollenRow>("op_pollen_api"),
        fetchPipe<GrantRow>("grants_api"),
        fetchPipe<RunRow>("ingest_runs_api"),
        fetchPipe<RevenueMonthlyRow>("revenue_monthly_api"),
        fetchPipe<GpuRunRow>("gpu_runs_api"),
    ]);

    return {
        transactions,
        providerMonthly,
        pollenMonthly,
        opTransactions,
        opCloud,
        opPollen,
        grants,
        runs,
        revenueMonthly,
        gpuRuns,
    };
}

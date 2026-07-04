import { FIXTURES } from "../fixtures";
import type {
    Data,
    InvoiceRow,
    MeterMonthlyRow,
    PaymentTxRow,
    RevenueMonthlyRow,
    RunRow,
    UsageMonthlyRow,
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
    if (fixturesMode()) return (FIXTURES[pipe] ?? []) as T[];

    const res = await fetch(`/api/pipes/${encodeURIComponent(pipe)}`);
    if (!res.ok) throw new TbError(pipe, res.status);

    const body = (await res.json()) as { data: T[] };
    return body.data;
}

export async function loadAll(): Promise<Data> {
    const [
        invoices,
        paymentsTx,
        meterMonthly,
        usageMonthly,
        runs,
        revenueMonthly,
    ] = await Promise.all([
        fetchPipe<InvoiceRow>("invoices_ep"),
        fetchPipe<PaymentTxRow>("payments_ep"),
        fetchPipe<MeterMonthlyRow>("meter_monthly_ep"),
        fetchPipe<UsageMonthlyRow>("usage_ep"),
        fetchPipe<RunRow>("runs_ep"),
        fetchPipe<RevenueMonthlyRow>("revenue_ep"),
    ]);

    return {
        invoices,
        paymentsTx,
        meterMonthly,
        usageMonthly,
        runs,
        revenueMonthly,
    };
}

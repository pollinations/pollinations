import type {
    MeterMonthlyRow,
    RevenueMonthlyRow,
    RunRow,
    TransactionRow,
    UsageMonthlyRow,
} from "./types";

const transactions: TransactionRow[] = [
    {
        date: "2026-06-01",
        vendor: "alibaba",
        category: "compute",
        charged_amount: 139.31,
        charged_currency: "EUR",
        paid_amount: 0,
        paid_currency: "",
        invoice_ref: "",
        match_status: "missing_invoice",
    },
    {
        date: "2026-06-13",
        vendor: "elevenlabs",
        category: "compute",
        charged_amount: 0,
        charged_currency: "",
        paid_amount: 299,
        paid_currency: "USD",
        invoice_ref: "2026-06/elevenlabs.pdf",
        match_status: "missing_payment",
    },
    {
        date: "2026-06-20",
        vendor: "tinybird",
        category: "infra",
        charged_amount: 34.74,
        charged_currency: "EUR",
        paid_amount: 40.39,
        paid_currency: "USD",
        invoice_ref: "2026-06/Invoice-FUNAOD-00014.pdf",
        match_status: "matched",
    },
];

const usageMonthly: UsageMonthlyRow[] = [
    {
        source: "tinybird",
        month: "2026-06",
        vendor: "google",
        model: "gemini-2.5-flash",
        currency: "POLLEN",
        cost_paid: 813.24,
        cost_quests: 231.66,
        price_paid: 642.18,
        price_quests: 148.03,
    },
    {
        source: "tinybird",
        month: "2026-06",
        vendor: "azure",
        model: "gpt-5.5",
        currency: "POLLEN",
        cost_paid: 834.12,
        cost_quests: 690.48,
        price_paid: 149.22,
        price_quests: 407.11,
    },
    {
        source: "tinybird",
        month: "2026-06",
        vendor: "openai",
        model: "gpt-4.1-mini",
        currency: "POLLEN",
        cost_paid: 42.35,
        cost_quests: 8.92,
        price_paid: 35.12,
        price_quests: 6.45,
    },
    {
        source: "tinybird",
        month: "2026-05",
        vendor: "replicate",
        model: "flux-kontext",
        currency: "POLLEN",
        cost_paid: 151.77,
        cost_quests: 130.14,
        price_paid: 138.02,
        price_quests: 87.55,
    },
];

const meterMonthly: MeterMonthlyRow[] = [
    {
        month: "2026-06",
        vendor: "assemblyai",
        currency: "USD",
        credit: 242.45,
        paid: 0,
        source: "manual",
    },
    {
        month: "2026-06",
        vendor: "openai",
        currency: "USD",
        credit: 531.25,
        paid: 0,
        source: "api",
    },
    {
        month: "2026-05",
        vendor: "ovhcloud",
        currency: "EUR",
        credit: 0,
        paid: 1059.8,
        source: "cli",
    },
];

const runs: RunRow[] = [
    {
        run_at: "2026-07-03 06:37:02",
        ok: 0,
        statuses:
            '{"vast.ai":"ok","runpod":"ok","ovhcloud":"err: connection reset by peer","digitalocean":"err: 403 role-gated"}',
        notes: "ovhcloud api timeout",
    },
    {
        run_at: "2026-07-02 06:31:44",
        ok: 1,
        statuses:
            '{"vast.ai":"ok","runpod":"ok","ovhcloud":"ok","digitalocean":"err: 403 role-gated"}',
        notes: "",
    },
];

const revenueMonthly: RevenueMonthlyRow[] = [
    {
        source: "stripe",
        month: "2026-06",
        currency: "EUR",
        gross_amount: 1200,
        fees_amount: 42,
        refunds_amount: 30,
    },
];

export const FIXTURES: Record<string, unknown[]> = {
    transactions_api: transactions,
    meter_monthly_api: meterMonthly,
    usage_monthly_api: usageMonthly,
    ingest_runs_api: runs,
    revenue_monthly_api: revenueMonthly,
};

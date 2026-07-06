import type {
    MeterMonthlyRow,
    OverrideRow,
    RevenueMonthlyRow,
    RunRow,
    TransactionRow,
    UsageMonthlyRow,
} from "./types";

const transactions: TransactionRow[] = [
    {
        date: "2026-06-01",
        provider: "alibaba",
        category: "compute",
        bank_charged_amount: 139.31,
        bank_charged_currency: "EUR",
        cash_paid_amount: 0,
        cash_paid_currency: "",
        credit_burned_amount: 0,
        credit_burned_currency: "",
        invoice_ref: "",
        match_status: "missing_invoice",
    },
    {
        date: "2026-06-13",
        provider: "elevenlabs",
        category: "compute",
        bank_charged_amount: 0,
        bank_charged_currency: "",
        cash_paid_amount: 299,
        cash_paid_currency: "USD",
        credit_burned_amount: 0,
        credit_burned_currency: "",
        invoice_ref: "2026-06/elevenlabs.pdf",
        match_status: "missing_payment",
    },
    {
        date: "2026-06-20",
        provider: "tinybird",
        category: "infra",
        bank_charged_amount: 34.74,
        bank_charged_currency: "EUR",
        cash_paid_amount: 40.39,
        cash_paid_currency: "USD",
        credit_burned_amount: 0,
        credit_burned_currency: "",
        invoice_ref: "2026-06/Invoice-FUNAOD-00014.pdf",
        match_status: "matched",
    },
];

const usageMonthly: UsageMonthlyRow[] = [
    {
        source: "tinybird",
        month: "2026-06",
        provider: "google",
        model: "gemini-2.5-flash",
        currency: "POLLEN",
        cost_paid_pollen: 813.24,
        cost_quest_pollen: 231.66,
        billable_paid_pollen: 642.18,
        billable_quest_pollen: 148.03,
    },
    {
        source: "tinybird",
        month: "2026-06",
        provider: "azure",
        model: "gpt-5.5",
        currency: "POLLEN",
        cost_paid_pollen: 834.12,
        cost_quest_pollen: 690.48,
        billable_paid_pollen: 149.22,
        billable_quest_pollen: 407.11,
    },
    {
        source: "tinybird",
        month: "2026-06",
        provider: "openai",
        model: "gpt-4.1-mini",
        currency: "POLLEN",
        cost_paid_pollen: 42.35,
        cost_quest_pollen: 8.92,
        billable_paid_pollen: 35.12,
        billable_quest_pollen: 6.45,
    },
    {
        source: "tinybird",
        month: "2026-05",
        provider: "replicate",
        model: "flux-kontext",
        currency: "POLLEN",
        cost_paid_pollen: 151.77,
        cost_quest_pollen: 130.14,
        billable_paid_pollen: 138.02,
        billable_quest_pollen: 87.55,
    },
];

const meterMonthly: MeterMonthlyRow[] = [
    {
        month: "2026-06",
        provider: "assemblyai",
        currency: "USD",
        credit_amount: 242.45,
        cash_amount: 0,
        source: "manual",
    },
    {
        month: "2026-06",
        provider: "openai",
        currency: "USD",
        credit_amount: 531.25,
        cash_amount: 0,
        source: "api",
    },
    {
        month: "2026-05",
        provider: "ovhcloud",
        currency: "EUR",
        credit_amount: 0,
        cash_amount: 1059.8,
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

const overrides: OverrideRow[] = [];

export const FIXTURES: Record<string, unknown[]> = {
    transactions_api: transactions,
    meter_monthly_api: meterMonthly,
    usage_monthly_api: usageMonthly,
    ingest_runs_api: runs,
    revenue_monthly_api: revenueMonthly,
    overrides_api: overrides,
};

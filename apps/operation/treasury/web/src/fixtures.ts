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
        provider: "alibaba",
        category: "compute",
        bank_charged: "€139.31",
        cash_paid: "",
        credit_burned: "",
        invoice_ref: "",
        match_status: "missing_invoice",
    },
    {
        date: "2026-06-13",
        provider: "elevenlabs",
        category: "compute",
        bank_charged: "",
        cash_paid: "$299.00",
        credit_burned: "",
        invoice_ref: "2026-06/elevenlabs.pdf",
        match_status: "missing_payment",
    },
    {
        date: "2026-06-20",
        provider: "tinybird",
        category: "infra",
        bank_charged: "€34.74",
        cash_paid: "$40.39",
        credit_burned: "",
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
        cost_usd: 242.45,
        funding: "credit",
        source: "manual",
    },
    {
        month: "2026-06",
        provider: "openai",
        cost_usd: 531.25,
        funding: "credit",
        source: "api",
    },
    {
        month: "2026-05",
        provider: "ovhcloud",
        cost_usd: 1208.17,
        funding: "cash",
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
        gross_eur: 1200,
        fees_eur: 42,
        refunds_eur: 30,
    },
];

export const FIXTURES: Record<string, unknown[]> = {
    transactions_api: transactions,
    meter_monthly_api: meterMonthly,
    usage_monthly_api: usageMonthly,
    ingest_runs_api: runs,
    revenue_monthly_api: revenueMonthly,
};

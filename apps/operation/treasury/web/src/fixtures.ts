import type {
    GrantRow,
    PollenMonthlyRow,
    ProviderMonthlyRow,
    RevenueMonthlyRow,
    RunRow,
    TransactionRow,
} from "./types";

const transactions: TransactionRow[] = [
    {
        date: "2026-06-01",
        vendor: "alibaba",
        category: "compute",
        charged_amount: 139.31,
        charged_currency: "EUR",
    },
    {
        date: "2026-06-13",
        vendor: "elevenlabs",
        category: "compute",
        charged_amount: 275.06,
        charged_currency: "EUR",
    },
    {
        date: "2026-06-20",
        vendor: "tinybird",
        category: "infra",
        charged_amount: 34.74,
        charged_currency: "EUR",
    },
    {
        date: "2026-06-27",
        vendor: "",
        category: "other",
        charged_amount: 45.2,
        charged_currency: "EUR",
    },
    {
        date: "2026-05-25",
        vendor: "deel",
        category: "payroll",
        charged_amount: 8015.44,
        charged_currency: "EUR",
    },
    {
        date: "2026-05-12",
        vendor: "google",
        category: "compute",
        charged_amount: 3399.05,
        charged_currency: "EUR",
    },
];

const pollenMonthly: PollenMonthlyRow[] = [
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
        byop_paid: 8.12,
        byop_quests: 1.86,
        model_paid: 0,
        model_quests: 0,
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
        byop_paid: 1.49,
        byop_quests: 4.07,
        model_paid: 0,
        model_quests: 0,
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
        byop_paid: 0,
        byop_quests: 0,
        model_paid: 0,
        model_quests: 0,
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
        byop_paid: 0.69,
        byop_quests: 0,
        model_paid: 0,
        model_quests: 0,
    },
    // No elevenlabs provider row + the June elevenlabs compute transaction (299
    // USD paid) makes this model demo the `cash` cost basis in the Models tab.
    {
        source: "tinybird",
        month: "2026-06",
        vendor: "elevenlabs",
        model: "eleven-v3",
        currency: "POLLEN",
        cost_paid: 200,
        cost_quests: 0,
        price_paid: 260,
        price_quests: 0,
        byop_paid: 0,
        byop_quests: 0,
        model_paid: 0,
        model_quests: 0,
    },
];

const providerMonthly: ProviderMonthlyRow[] = [
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
    {
        month: "2026-06",
        vendor: "google",
        currency: "EUR",
        credit: 0,
        paid: 4489.35,
        source: "bq",
    },
    // Matches the May google compute transaction — demos the provider ✓ chip.
    {
        month: "2026-05",
        vendor: "google",
        currency: "EUR",
        credit: 0,
        paid: 3399.05,
        source: "bq",
    },
];

const grants: GrantRow[] = [
    {
        vendor: "azure",
        label: "lot 1",
        granted: 100000,
        currency: "USD",
        start_date: "2025-09-19",
        expires: "2025-12-15",
    },
    {
        vendor: "azure",
        label: "lot 2",
        granted: 250036,
        currency: "USD",
        start_date: "2026-04-06",
        expires: "2028-04-06",
    },
    // No-expiry sentinel renders as a dash.
    {
        vendor: "fireworks",
        label: "myceli",
        granted: 10000,
        currency: "USD",
        start_date: "2026-01-01",
        expires: "1970-01-01",
    },
    {
        vendor: "elevenlabs",
        label: "",
        granted: 3300,
        currency: "USD",
        start_date: "2026-02-01",
        expires: "2026-04-30",
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
    {
        source: "stripe",
        month: "2026-05",
        currency: "EUR",
        gross_amount: 10392.93,
        fees_amount: 941.58,
        refunds_amount: 0,
    },
];

export const FIXTURES: Record<string, unknown[]> = {
    transactions_api: transactions,
    provider_monthly_api: providerMonthly,
    pollen_monthly_api: pollenMonthly,
    grants_api: grants,
    ingest_runs_api: runs,
    revenue_monthly_api: revenueMonthly,
};

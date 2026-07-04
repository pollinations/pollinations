import type {
    CoverageRow,
    GapRow,
    InvoiceRow,
    MeterMonthlyRow,
    PaymentTxRow,
    RevenueMonthlyRow,
    RunRow,
    UsageMonthlyRow,
} from "./types";

const coverage: CoverageRow[] = [
    {
        month: "2026-01",
        provider: "vast.ai",
        status: "missing_invoice",
        invoice_usd: 0,
        payment_usd: 480.19,
    },
    {
        month: "2026-02",
        provider: "vast.ai",
        status: "missing_invoice",
        invoice_usd: 0,
        payment_usd: 2518.4,
    },
    {
        month: "2026-03",
        provider: "vast.ai",
        status: "amount_mismatch",
        invoice_usd: 3481,
        payment_usd: 3466.55,
    },
    {
        month: "2026-01",
        provider: "openai",
        status: "ok",
        invoice_usd: 226.4,
        payment_usd: 226.4,
    },
    {
        month: "2026-02",
        provider: "openai",
        status: "ok",
        invoice_usd: 254.1,
        payment_usd: 254.1,
    },
    {
        month: "2026-01",
        provider: "aws",
        status: "ok_credit",
        invoice_usd: 0,
        payment_usd: 0,
    },
    {
        month: "2026-02",
        provider: "aws",
        status: "ok_credit",
        invoice_usd: 0,
        payment_usd: 0,
    },
    {
        month: "2026-01",
        provider: "anthropic",
        status: "needs_review",
        invoice_usd: 616.1,
        payment_usd: 616.1,
    },
    {
        month: "2026-02",
        provider: "azure",
        status: "accepted",
        invoice_usd: 0,
        payment_usd: 0,
    },
    {
        month: "2026-03",
        provider: "scaleway",
        status: "missing_payment",
        invoice_usd: 289.6,
        payment_usd: 0,
    },
    {
        month: "2026-03",
        provider: "gcp",
        status: "needs_data",
        invoice_usd: 0,
        payment_usd: 0,
    },
];

const gaps: GapRow[] = [
    {
        month: "2026-01",
        provider: "vast.ai",
        status: "missing_invoice",
        invoice_usd: 0,
        payment_usd: 480.19,
        delta_usd: -480.19,
    },
    {
        month: "2026-03",
        provider: "vast.ai",
        status: "amount_mismatch",
        invoice_usd: 3481,
        payment_usd: 3466.55,
        delta_usd: 14.45,
    },
    {
        month: "2026-01",
        provider: "anthropic",
        status: "needs_review",
        invoice_usd: 616.1,
        payment_usd: 616.1,
        delta_usd: 0,
    },
];

const invoices: InvoiceRow[] = [
    {
        sha256: "aa11bb22cc33dd44ee55ff6600112233445566778899aabbccddeeff00112233",
        provider: "vast.ai",
        category: "",
        period_month: "2026-03",
        amount: 500,
        currency: "USD",
        credit_usd: 0,
        invoice_number: "vast-88213",
        issued_at: "2026-03-04",
        source: "ai",
        file_ref: "",
        status: "parsed",
        ingested_at: "2026-07-03 06:31:00",
    },
    {
        sha256: "bb22cc33dd44ee55ff660011223344556677889900aabbccddeeff0011223344",
        provider: "openai",
        category: "compute",
        period_month: "2026-01",
        amount: 226.4,
        currency: "USD",
        credit_usd: 0,
        invoice_number: "OAI-2026-01",
        issued_at: "2026-02-01",
        source: "manual",
        file_ref: "2026-01/openai_2026-01_bb22cc33_inv.pdf",
        status: "parsed",
        ingested_at: "2026-07-03 06:31:00",
    },
    {
        sha256: "dd44ee55ff660011223344556677889900aabbccddeeff0011223344556677aa",
        provider: "aws",
        category: "compute",
        period_month: "2026-06",
        amount: 0,
        currency: "USD",
        credit_usd: 1922.4,
        invoice_number: "AWS-2026-06",
        issued_at: "2026-07-01",
        source: "ai",
        file_ref: "2026-06/aws_2026-06_dd44ee55_inv.pdf",
        status: "parsed",
        ingested_at: "2026-07-03 06:31:00",
    },
];

const usageMonthly: UsageMonthlyRow[] = [
    {
        month: "2026-06",
        provider: "google",
        model: "gemini-2.5-flash",
        cost_paid_pollen: 813.24,
        cost_quest_pollen: 231.66,
        billable_paid_pollen: 642.18,
        billable_quest_pollen: 148.03,
    },
    {
        month: "2026-06",
        provider: "azure",
        model: "gpt-5.5",
        cost_paid_pollen: 834.12,
        cost_quest_pollen: 690.48,
        billable_paid_pollen: 149.22,
        billable_quest_pollen: 407.11,
    },
    {
        month: "2026-06",
        provider: "openai",
        model: "gpt-4.1-mini",
        cost_paid_pollen: 42.35,
        cost_quest_pollen: 8.92,
        billable_paid_pollen: 35.12,
        billable_quest_pollen: 6.45,
    },
    {
        month: "2026-05",
        provider: "replicate",
        model: "flux-kontext",
        cost_paid_pollen: 151.77,
        cost_quest_pollen: 130.14,
        billable_paid_pollen: 138.02,
        billable_quest_pollen: 87.55,
    },
];

const paymentsTx: PaymentTxRow[] = [
    {
        paid_at: "2026-06-14",
        provider: "",
        category: "unmatched",
        counterparty: "NVIDIA CORP",
        amount_eur: 4400.5,
        wise_ref: "WISE-NVIDIA-1",
    },
    {
        paid_at: "2026-06-02",
        provider: "vast.ai",
        category: "compute",
        counterparty: "VAST AI LABS",
        amount_eur: 442.16,
        wise_ref: "WISE-VAST-1",
    },
    {
        paid_at: "2026-05-21",
        provider: "openai",
        category: "compute",
        counterparty: "OPENAI LLC",
        amount_eur: 208.37,
        wise_ref: "WISE-OAI-1",
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
            '{"wise":"ok","gmail":"ok","inbox":"ok","vast.ai":"ok","runpod":"ok","ovhcloud":"err: connection reset by peer","digitalocean":"err: 403 role-gated"}',
        notes: "ovhcloud api timeout",
    },
    {
        run_at: "2026-07-02 06:31:44",
        ok: 1,
        statuses:
            '{"wise":"ok","gmail":"ok","inbox":"ok","vast.ai":"ok","runpod":"ok","ovhcloud":"ok","digitalocean":"err: 403 role-gated"}',
        notes: "",
    },
];

const revenueMonthly: RevenueMonthlyRow[] = [
    {
        month: "2026-06",
        gross_eur: 1200,
        fees_eur: 42,
        refunds_eur: 30,
    },
];

export const FIXTURES: Record<string, unknown[]> = {
    coverage_ep: coverage,
    gaps_ep: gaps,
    invoices_ep: invoices,
    payments_ep: paymentsTx,
    meter_monthly_ep: meterMonthly,
    usage_ep: usageMonthly,
    runs_ep: runs,
    revenue_ep: revenueMonthly,
};

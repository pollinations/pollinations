import type {
    CoverageRow,
    GapRow,
    GrantRow,
    InvoiceRow,
    MeterMonthlyRow,
    PaymentTxRow,
    ProviderAliasRow,
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
        file_ref: "",
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
        file_ref: "2026-01/openai_2026-01_bb22cc33_inv.pdf",
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
        file_ref: "2026-06/aws_2026-06_dd44ee55_inv.pdf",
    },
];

const grants: GrantRow[] = [
    {
        pool: "aws-activate",
        providers: "aws",
        category: "compute",
        left_usd: 4200.5,
        left_src: "api",
        prepaid_left_usd: null,
        prepaid_left_src: "",
        expires: "2026-12",
    },
    {
        pool: "azure-startup",
        providers: "azure",
        category: "compute",
        left_usd: 244600,
        left_src: "api",
        prepaid_left_usd: null,
        prepaid_left_src: "",
        expires: "2028-04",
    },
    {
        pool: "lambda-credit",
        providers: "lambda",
        category: "compute",
        left_usd: 1200,
        left_src: "hc",
        prepaid_left_usd: null,
        prepaid_left_src: "",
        expires: "2026-12",
    },
    {
        pool: "vastai-prepaid",
        providers: "vast.ai",
        category: "compute",
        left_usd: null,
        left_src: "",
        prepaid_left_usd: 118.4,
        prepaid_left_src: "api",
        expires: "",
    },
];

const usageMonthly: UsageMonthlyRow[] = [
    {
        month: "2026-06",
        provider: "google",
        model: "gemini-2.5-flash",
        billable_requests_paid_pollen: 125320,
        billable_requests_quest_pollen: 44291,
        cost_paid_pollen: 813.24,
        cost_quest_pollen: 231.66,
        billable_paid_pollen: 642.18,
        billable_quest_pollen: 148.03,
    },
    {
        month: "2026-06",
        provider: "azure",
        model: "gpt-5.5",
        billable_requests_paid_pollen: 23469,
        billable_requests_quest_pollen: 69012,
        cost_paid_pollen: 834.12,
        cost_quest_pollen: 690.48,
        billable_paid_pollen: 149.22,
        billable_quest_pollen: 407.11,
    },
    {
        month: "2026-06",
        provider: "openai",
        model: "gpt-4.1-mini",
        billable_requests_paid_pollen: 3891,
        billable_requests_quest_pollen: 1220,
        cost_paid_pollen: 42.35,
        cost_quest_pollen: 8.92,
        billable_paid_pollen: 35.12,
        billable_quest_pollen: 6.45,
    },
    {
        month: "2026-05",
        provider: "replicate",
        model: "flux-kontext",
        billable_requests_paid_pollen: 7054,
        billable_requests_quest_pollen: 1301,
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
    },
    {
        paid_at: "2026-06-02",
        provider: "vast.ai",
        category: "compute",
        counterparty: "VAST AI LABS",
        amount_eur: 442.16,
    },
    {
        paid_at: "2026-05-21",
        provider: "openai",
        category: "compute",
        counterparty: "OPENAI LLC",
        amount_eur: 208.37,
    },
];

const meterMonthly: MeterMonthlyRow[] = [
    {
        month: "2026-06",
        provider: "assemblyai",
        cash_burn_usd: 0,
        cash_src: "",
        credit_burn_usd: 242.45,
        credit_src: "manual",
    },
    {
        month: "2026-06",
        provider: "openai",
        cash_burn_usd: 0,
        cash_src: "",
        credit_burn_usd: 531.25,
        credit_src: "api",
    },
    {
        month: "2026-05",
        provider: "ovhcloud",
        cash_burn_usd: 1208.17,
        cash_src: "cli",
        credit_burn_usd: 0,
        credit_src: "",
    },
];

const runs: RunRow[] = [
    {
        run_at: "2026-07-03 06:37:02",
        ok: 0,
        statuses:
            '{"wise":"ok","gmail":"ok","inbox":"ok","vast.ai":"ok","runpod":"ok","ovhcloud":"err: connection reset by peer","digitalocean":"err: 403 role-gated"}',
    },
    {
        run_at: "2026-07-02 06:31:44",
        ok: 1,
        statuses:
            '{"wise":"ok","gmail":"ok","inbox":"ok","vast.ai":"ok","runpod":"ok","ovhcloud":"ok","digitalocean":"err: 403 role-gated"}',
    },
];

const providerAliases: ProviderAliasRow[] = [
    { alias: "amazon web", provider: "aws" },
    { alias: "automat-it", provider: "aws" },
    { alias: "openai", provider: "openai" },
    { alias: "vast.ai", provider: "vast.ai" },
    { alias: "vast ai", provider: "vast.ai" },
    { alias: "elevenlabs", provider: "elevenlabs" },
    { alias: "retell ai", provider: "retell" },
];

export const FIXTURES: Record<string, unknown[]> = {
    coverage_ep: coverage,
    gaps_ep: gaps,
    invoices_ep: invoices,
    payments_ep: paymentsTx,
    meter_monthly_ep: meterMonthly,
    grants_ep: grants,
    usage_ep: usageMonthly,
    runs_ep: runs,
    provider_aliases_ep: providerAliases,
};

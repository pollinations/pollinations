import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Data, OpPollenRow, VendorLedgerRow } from "../types";
import { GpuTab } from "../views/GpuTab";
import { gpuWorkloadRows, gpuWorkloadSummary } from "./gpu";
import { ledgerModelResolver } from "./modelIdentity";
import { modelReconcileRows } from "./modelReconcile";
import { unitEconomicsRows } from "./unitEconomics";

const usage = (overrides: Partial<OpPollenRow> = {}): OpPollenRow => ({
    source: "tinybird",
    month: "2026-06",
    vendor: "google",
    model: "gemini-3.5-flash",
    currency: "USD",
    cost_paid: 10,
    cost_quests: 0,
    price_paid: 10,
    price_quests: 0,
    byop_paid: 0,
    byop_quests: 0,
    model_paid: 0,
    model_quests: 0,
    requests_paid: 1,
    requests_quests: 0,
    ...overrides,
});
const cost = (overrides: Partial<VendorLedgerRow> = {}): VendorLedgerRow => ({
    entry_id: "cost",
    source: "provider",
    vendor: "google",
    type: "inference",
    start: "2026-06-01 00:00:00",
    end: "2026-07-01 00:00:00",
    currency: "USD",
    paid: -20,
    credit: 0,
    model: "gemini-3.5-flash",
    resource_id: "",
    resource_name: "",
    resource_sku: "",
    resource_count: 1,
    evidence: "provider statement",
    recorded_at: "2026-07-02 00:00:00",
    ...overrides,
});

describe("reviewed model allocation integrity", () => {
    it("keeps a qualified or dated mapping ahead of an observed bare identity", () => {
        const data: Data = {
            opPollen: [
                usage({ model: "veo-3-fast" }),
                usage({
                    vendor: "replicate",
                    model: "wan-pro-1080p",
                    month: "2026-08",
                }),
            ],
        };
        const resolver = ledgerModelResolver(data);
        expect(
            resolver.ledger(
                cost({
                    model: "veo-3-fast",
                    resource_sku: "Veo 3 Fast 1080p Audio Video Generation",
                }),
            ),
        ).toEqual({ kind: "model", model: "veo-1080p" });
        expect(
            resolver.ledger(
                cost({
                    vendor: "replicate",
                    model: "wan-pro-1080p",
                    start: "2026-08-01 00:00:00",
                    resource_sku:
                        "Output video duration (seconds): wan-27-i2v-1080p",
                }),
            ).kind,
        ).toBe("unmapped");
    });

    it("keeps reviewed shared billing shared even when its label was also metered", () => {
        const data: Data = { opPollen: [usage(), usage({ model: "gemini" })] };
        expect(ledgerModelResolver(data).ledger(cost()).kind).toBe("shared");
    });

    it("keeps named provider cost without inventing zero usage or a model loss", () => {
        const data: Data = {
            vendorLedger: [
                cost({ vendor: "azure", model: "Flex Megapixel", paid: -5 }),
            ],
            opPollen: [usage({ vendor: "azure", model: "kontext" })],
        };
        const original = JSON.stringify(data);
        const providers = modelReconcileRows(data);
        const model = unitEconomicsRows(providers, "model").find(
            (row) => row.providerUsageUsd === 5,
        );
        expect(model).toMatchObject({
            allocationStatus: "missing usage",
            providerCashUsd: 5,
            paidPollenUsd: null,
            netCashContributionUsd: null,
            economicContributionUsd: null,
        });
        expect(providers[0].providerUsageUsd).toBe(5);
        expect(JSON.stringify(data)).toBe(original);
    });

    it("preserves overlapping upstream totals while withholding incomplete group margins", () => {
        const providers = modelReconcileRows({
            vendorLedger: [
                cost({ vendor: "aws", model: "claude-opus-4-6", paid: -100 }),
                cost({ vendor: "aws", model: "claude-opus-4-8", paid: -50 }),
            ],
            opPollen: [
                usage({ vendor: "aws", model: "claude-large", price_paid: 20 }),
                usage({
                    vendor: "aws",
                    model: "claude-opus-4.6",
                    price_paid: 5,
                }),
                usage({
                    vendor: "aws",
                    model: "claude-opus-4.8",
                    price_paid: 10,
                }),
            ],
        });
        expect(providers).toHaveLength(1);
        expect(providers[0].providerUsageUsd).toBe(150);
        expect(providers[0].paidPollenUsd).toBe(35);
        expect(
            providers[0].models.reduce(
                (sum, row) => sum + (row.providerUsageUsd ?? 0),
                0,
            ),
        ).toBe(150);
        expect(
            providers[0].models.reduce(
                (sum, row) => sum + (row.paidPollenUsd ?? 0),
                0,
            ),
        ).toBe(35);
        const groups = unitEconomicsRows(providers, "model").filter(
            (row) => row.members?.length,
        );
        expect(groups).toHaveLength(2);
        for (const group of groups)
            expect(group).toMatchObject({
                allocationStatus: "ambiguous allocation",
                netCashContributionUsd: null,
                economicContributionUsd: null,
                meterGapUsd: null,
            });
    });
});

describe("GPU allocation integrity", () => {
    it("preserves every resource and usage amount without claiming ambiguous per-model margins", () => {
        const data: Data = {
            vendorLedger: [
                cost({
                    vendor: "runpod",
                    type: "gpu",
                    model: "flux",
                    resource_id: "flux",
                    paid: -10,
                }),
                cost({
                    vendor: "runpod",
                    type: "gpu",
                    model: "zimage",
                    resource_id: "zimage",
                    paid: -20,
                }),
                cost({
                    vendor: "runpod",
                    type: "gpu",
                    model: "flux,zimage",
                    resource_id: "shared",
                    paid: -100,
                }),
            ],
            opPollen: [
                usage({ vendor: "runpod", model: "flux", price_paid: 30 }),
                usage({ vendor: "runpod", model: "zimage", price_paid: 40 }),
            ],
        };
        const original = JSON.stringify(data);
        const rows = gpuWorkloadRows(data, "2026-06");
        expect(rows.reduce((sum, row) => sum + row.totalCostUsd, 0)).toBe(130);
        expect(rows.reduce((sum, row) => sum + (row.retainedUsd ?? 0), 0)).toBe(
            70,
        );
        expect(rows.flatMap((row) => row.resources)).toHaveLength(3);
        for (const row of rows) {
            expect(row.flags).toContain("ambiguous workload allocation");
            expect(row.flags).not.toContain("missing Pollen");
            expect(row.currentResultUsd).toBeNull();
            expect(row.fullCostResultUsd).toBeNull();
        }
        expect(JSON.stringify(data)).toBe(original);
    });

    it("keeps partial recorded costs visible in the collapsed workload row", () => {
        const data: Data = {
            vendorLedger: [
                cost({
                    vendor: "runpod",
                    type: "gpu",
                    model: "zimage",
                    resource_id: "zimage",
                    paid: -100,
                }),
                cost({
                    vendor: "vast",
                    type: "gpu",
                    model: "flux",
                    resource_id: "other-workload",
                    paid: -1,
                }),
            ],
            opPollen: [
                usage({ vendor: "runpod", model: "zimage" }),
                usage({ vendor: "vast", model: "zimage" }),
            ],
        };
        const rows = gpuWorkloadRows(data, "2026-06");
        expect(rows[0]).toMatchObject({
            totalCostUsd: 100,
            currentResultUsd: null,
            flags: ["missing GPU cost"],
        });
        const html = renderToStaticMarkup(
            createElement(GpuTab, { data, month: "2026-06" }),
        );
        const body = html.slice(html.indexOf("<tbody"));
        expect(body).toContain("$100");
    });

    it("keeps an empty period unknown in the calculation and cards", () => {
        expect(gpuWorkloadSummary([])).toMatchObject({
            currentResultUsd: null,
            fullCostResultUsd: null,
        });
        const html = renderToStaticMarkup(
            createElement(GpuTab, { data: {}, month: "2026-06" }),
        );
        expect(html).toContain("No data");
        expect(html).toContain("No recorded costs");
        expect(html).not.toContain("$0 total");
    });
});

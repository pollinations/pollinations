import { describe, expect, it } from "vitest";
import type { Data, OpPollenRow, VendorLedgerRow } from "../types";
import {
    computeModeIndex,
    directDeliveryData,
    managedInferenceData,
    pollenComputeMode,
} from "./computeModes";
import { gpuWorkloadRows, gpuWorkloadSummary } from "./gpu";
import { ledgerModelResolver } from "./modelIdentity";
import { modelReconcileRows, modelReconcileSummary } from "./modelReconcile";
import { reconciliationState } from "./reconciliation";

const usage = (
    model: string,
    overrides: Partial<OpPollenRow> = {},
): OpPollenRow => ({
    month: "2026-01",
    vendor: "scaleway",
    model,
    currency: "USD",
    cost_paid: 0,
    cost_quests: 0,
    price_paid: 100,
    price_quests: 20,
    byop_paid: 10,
    byop_quests: 0,
    model_paid: 5,
    model_quests: 0,
    requests_paid: 10,
    requests_quests: 2,
    ...overrides,
});
const cost = (
    model: string,
    type: string,
    overrides: Partial<VendorLedgerRow> = {},
): VendorLedgerRow => ({
    entry_id: `${model}-${type}`,
    vendor: "scaleway",
    model,
    type,
    source: "invoice",
    start: "2026-01-01",
    end: "2026-02-01",
    currency: "USD",
    paid: -30,
    credit: -10,
    resource_id: `${model}-${type}`,
    resource_name: model,
    resource_sku: type === "gpu" ? "gpu-hours" : "tokens",
    resource_count: 1,
    evidence: "",
    recorded_at: "2026-02-01 00:00:00",
    ...overrides,
});
const now = new Date("2026-10-15T00:00:00Z");

describe("shared model identity and delivery reconciliation", () => {
    it("splits a mixed month by exact model and conserves cost, usage and creator deductions", () => {
        const data: Data = {
            opPollen: [
                usage("mistral"),
                usage("black-forest-labs/flux.1-schnell"),
            ],
            vendorLedger: [
                cost("mistral-small-3.2-24b", "inference"),
                cost("flux", "gpu"),
            ],
        };
        const before = JSON.stringify(data);
        const inference = modelReconcileSummary(
            modelReconcileRows(managedInferenceData(data)),
        );
        const gpu = gpuWorkloadSummary(gpuWorkloadRows(data, "2026-01"));
        const providers = modelReconcileSummary(
            modelReconcileRows(directDeliveryData(data)),
        );
        expect(inference.retainedPaidUsd).toBe(85);
        expect(gpu.retainedUsd).toBe(85);
        expect(inference.retainedPaidUsd + gpu.retainedUsd).toBe(
            providers.retainedPaidUsd,
        );
        expect(
            inference.providerUsageUsd + gpu.paidCostUsd + gpu.creditCostUsd,
        ).toBe(providers.providerUsageUsd);
        expect(inference.netCashContributionUsd).toBe(55);
        expect(gpu.currentResultUsd).toBe(55);
        expect(gpu.fullCostResultUsd).toBe(45);
        expect(
            reconciliationState(data, now)
                .issues.flatMap((row) => row.messages)
                .some((message) => message.includes("cannot yet be assigned")),
        ).toBe(false);
        expect(JSON.stringify(data)).toBe(before);
    });

    it("uses reviewed GPU routing without assigning the shared hardware bill", () => {
        const data: Data = {
            opPollen: [usage("mistral"), usage("turbo")],
            vendorLedger: [
                cost("mistral-small-3.2-24b", "inference"),
                cost("l4", "gpu"),
            ],
        };
        const index = computeModeIndex(data);
        expect(pollenComputeMode(index, "2026-01", "scaleway", "turbo")).toBe(
            "gpu-capacity",
        );
        expect(
            managedInferenceData(data).opPollen?.map((row) => row.model),
        ).toEqual(["mistral"]);
        const gpu = gpuWorkloadRows(data, "2026-01");
        expect(gpu.find((row) => row.workload === "turbo")?.flags).toContain(
            "missing GPU cost",
        );
        expect(gpu.find((row) => row.workload === "l4")).toMatchObject({
            totalCostUsd: 40,
            paidUsd: null,
            fullCostResultUsd: null,
            flags: ["missing Pollen"],
        });
        expect(pollenComputeMode(index, "2026-02", "scaleway", "turbo")).toBe(
            "unclassified",
        );
        expect(pollenComputeMode(index, "2026-01", "unknown", "turbo")).toBe(
            "unclassified",
        );
    });

    it("leaves an unmatched mixed-month workload open instead of guessing from hardware", () => {
        const data: Data = {
            opPollen: [usage("mistral"), usage("unreviewed-workload")],
            vendorLedger: [
                cost("mistral-small-3.2-24b", "inference"),
                cost("l4", "gpu"),
            ],
        };
        expect(
            managedInferenceData(data).opPollen?.map((row) => row.model),
        ).toEqual(["mistral"]);
        expect(
            gpuWorkloadSummary(gpuWorkloadRows(data, "2026-01")).paidUsd,
        ).toBe(0);
        const messages = reconciliationState(data, now).issues.flatMap(
            (row) => row.messages,
        );
        expect(messages).toContain(
            "Pollen usage cannot yet be assigned to inference or GPU: unreviewed-workload.",
        );
        expect(
            messages.some(
                (message) =>
                    message.includes("cannot yet be assigned") &&
                    message.includes("mistral"),
            ),
        ).toBe(false);
    });

    it("does not double-count the same model when both delivery types billed it", () => {
        const data: Data = {
            opPollen: [usage("flux")],
            vendorLedger: [cost("flux", "inference"), cost("flux", "gpu")],
        };
        expect(managedInferenceData(data).opPollen).toEqual([]);
        expect(
            gpuWorkloadSummary(gpuWorkloadRows(data, "2026-01")).paidUsd,
        ).toBe(0);
        expect(
            modelReconcileSummary(modelReconcileRows(directDeliveryData(data)))
                .paidPollenUsd,
        ).toBe(100);
        expect(
            reconciliationState(data, now).issues.flatMap(
                (row) => row.messages,
            ),
        ).toContain(
            "Pollen usage cannot yet be assigned to inference or GPU: flux.",
        );
    });

    it("uses the same shared GPU workload mapping in the provider and GPU views", () => {
        const data: Data = {
            opPollen: [
                usage("black-forest-labs/flux.1-schnell"),
                usage("tongyi-mai/z-image-turbo"),
            ],
            vendorLedger: [cost("flux, zimage", "gpu")],
        };
        const gpu = gpuWorkloadRows(data, "2026-01");
        const providers = modelReconcileRows(directDeliveryData(data));
        expect(gpu).toHaveLength(1);
        expect(gpu[0].flags).toEqual([]);
        expect(gpu[0].retainedUsd).toBe(170);
        expect(providers[0].models).toHaveLength(1);
        expect(providers[0].models[0].members).toEqual([
            "black-forest-labs/flux.1-schnell",
            "tongyi-mai/z-image-turbo",
        ]);
        expect(providers[0].models[0].providerUsageUsd).toBe(
            gpu[0].totalCostUsd,
        );
    });

    it("keeps a partly unknown GPU pool unallocated in both views", () => {
        const data: Data = {
            opPollen: [usage("flux")],
            vendorLedger: [cost("flux, unknown-workload", "gpu")],
        };
        const gpu = gpuWorkloadRows(data, "2026-01");
        expect(gpu.find((row) => row.kind === "unassigned")).toMatchObject({
            totalCostUsd: 40,
            retainedUsd: null,
            fullCostResultUsd: null,
            flags: ["unmapped"],
        });
        expect(
            gpu.find(
                (row) => row.workload === "black-forest-labs/flux.1-schnell",
            )?.flags,
        ).toContain("missing GPU cost");
        expect(
            modelReconcileSummary(modelReconcileRows(data)).buckets
                .allocatedUsd,
        ).toBe(0);
    });

    it("preserves date-qualified identities and never borrows a mapping from another provider-month", () => {
        const data: Data = {
            opPollen: [
                usage("minimax", { vendor: "fireworks", month: "2026-05" }),
                usage("minimax/minimax-m3", {
                    vendor: "fireworks",
                    month: "2026-09",
                }),
                usage("flux", { month: "2026-02" }),
            ],
            vendorLedger: [
                cost("MiniMax M2.7", "inference", {
                    vendor: "fireworks",
                    start: "2026-05-01",
                }),
                cost("flux", "gpu", { start: "2026-02-01" }),
                cost("unassigned", "inference"),
                cost("l4", "gpu"),
            ],
        };
        const identity = ledgerModelResolver(data);
        expect(identity.model("2026-05", "fireworks", "minimax")).toBe(
            "minimax/minimax-m2.7",
        );
        const datedCost = data.vendorLedger?.[0];
        if (!datedCost) throw new Error("Missing dated fixture");
        expect(identity.ledger(datedCost)).toEqual({
            kind: "model",
            model: "minimax/minimax-m2.7",
        });
        const index = computeModeIndex(data);
        expect(pollenComputeMode(index, "2026-01", "scaleway", "flux")).toBe(
            "mixed",
        );
        expect(pollenComputeMode(index, "2026-02", "scaleway", "flux")).toBe(
            "gpu-capacity",
        );
    });
});

describe("historical canonical names", () => {
    it.each([
        ["2026-01", "fireworks", "minimax", "minimax/minimax-m2"],
        ["2026-02", "fireworks", "minimax", "minimax/minimax-m2"],
        ["2026-03", "fireworks", "minimax", "minimax"],
        ["2026-04", "fireworks", "minimax", "minimax"],
        ["2026-04", "aws", "minimax", "minimax/minimax-m2.5"],
        ["2026-05", "fireworks", "minimax", "minimax/minimax-m2.7"],
        ["2026-06", "fireworks", "minimax", "minimax"],
        ["2026-07", "fireworks", "minimax", "minimax/minimax-m3"],
        ["2026-05", "azure", "minimax", "minimax"],
        ["2026-01", "aws", "claude", "anthropic/claude-sonnet-4.5"],
        ["2026-02", "aws", "claude", "claude"],
        ["2026-07", "aws", "claude", "anthropic/claude-sonnet-4.6"],
        ["2026-01", "vast", "flux", "black-forest-labs/flux.1-schnell"],
        ["2026-01", "azure", "gptimage", "openai/gpt-image-1-mini"],
    ])(
        "resolves %s / %s / %s only to its reviewed identity",
        (month, vendor, id, expected) => {
            expect(ledgerModelResolver({}).model(month, vendor, id)).toBe(
                expected,
            );
        },
    );

    it("keeps an ambiguous month in reconciliation even when a newer canonical model is present", () => {
        const data: Data = {
            opPollen: [
                usage("minimax", { month: "2026-06", vendor: "fireworks" }),
                usage("minimax/minimax-m3", {
                    month: "2026-06",
                    vendor: "fireworks",
                }),
            ],
            vendorLedger: [
                cost("MiniMax M2.7", "inference", {
                    vendor: "fireworks",
                    start: "2026-06-01",
                }),
            ],
        };
        const identity = ledgerModelResolver(data);
        expect(identity.model("2026-06", "fireworks", "minimax")).toBe(
            "minimax",
        );
        expect(
            reconciliationState(data, now).issues.flatMap((r) => r.messages),
        ).toContain(
            "Historical model name needs an exact match for this month: minimax.",
        );
        expect(modelReconcileSummary(modelReconcileRows(data))).toMatchObject({
            paidPollenUsd: 200,
            questPollenUsd: 40,
            retainedPaidUsd: 170,
            providerUsageUsd: 40,
        });
    });

    it("joins exact old and new spellings once, leaving source records untouched", () => {
        const data: Data = {
            opPollen: [
                usage("flux"),
                usage("black-forest-labs/flux.1-schnell"),
            ],
            vendorLedger: [cost("flux", "gpu")],
        };
        const original = JSON.stringify(data);
        const rows = gpuWorkloadRows(data, "2026-01");
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            workload: "black-forest-labs/flux.1-schnell",
            paidUsd: 200,
            questUsd: 40,
            retainedUsd: 170,
            totalCostUsd: 40,
        });
        expect(JSON.stringify(data)).toBe(original);
        expect(
            reconciliationState(data, now)
                .issues.flatMap((r) => r.messages)
                .some((m) => m.includes("Historical model name")),
        ).toBe(false);
    });
});

it("keeps unresolved cost-only historical identities in reconciliation", () => {
    const data: Data = {
        vendorLedger: [
            cost("minimax", "inference", {
                vendor: "fireworks",
                start: "2026-03-01",
            }),
        ],
    };
    expect(
        reconciliationState(data, now).issues.flatMap((r) => r.messages),
    ).toContain(
        "Historical model name needs an exact match for this month: minimax.",
    );
});

import assert from "node:assert/strict";
import { expect, it } from "vitest";
import { PRIVATE_CONFIG_FIXTURE } from "../fixtures";
import type { ArchiveCheck, Data, VendorLedgerRow } from "../types";
import { PROVIDER_REGISTRY } from "./providerRegistry";
import { reviewAccountId, vendorDirectoryRows } from "./vendorDirectory";

it("keeps balance dates separate from review dates and does not apply an account check to siblings", () => {
    const provider = PROVIDER_REGISTRY.find(
        (row) => (row.accounts?.length ?? 0) > 1,
    );
    assert(provider?.accounts && provider.accounts.length > 1);
    const [first, second] = provider.accounts;
    const check: ArchiveCheck = {
        provider: provider.id,
        account: first.id,
        month: "2026-08",
        checkedAt: "2026-10-15T12:00:00Z",
        status: "partial",
        note: "Only August evidence checked",
        evidence: ["https://drive.google.com/file/d/test/view"],
    };
    const snapshot: VendorLedgerRow = {
        entry_id: "test-balance",
        source: "dashboard",
        vendor: provider.id,
        account_id: first.id,
        account_name: first.label,
        type: "balance",
        start: "2026-10-02",
        end: "2027-01-01",
        credit: 20,
        paid: 10,
        currency: "USD",
        resource_id: "",
        resource_name: "",
        resource_sku: "current-balance",
        resource_count: 1,
        model: "",
        evidence: "",
        recorded_at: "2026-10-16 12:00:00",
    };
    const data: Data = {
        vendorLedger: [snapshot],
        opTransactions: [],
        privateConfig: {
            ...structuredClone(PRIVATE_CONFIG_FIXTURE),
            reviewNotes: {
                providerCheckExplanations: [],
                meterDriftExplanations: [],
                pollenWitnessExplanations: [],
                archiveChecks: [
                    check,
                    { ...check, account: "unidentified-account" },
                    { ...check, checkedAt: "2026-09-01T12:00:00Z" },
                ],
            },
        },
    };
    const before = structuredClone(data);
    const row = vendorDirectoryRows(
        data,
        new Date("2026-10-17T12:00:00Z"),
    ).find((row) => row.provider.id === provider.id);
    assert(row);
    const account = row.accounts.find((account) => account.id === first.id);
    assert(account);
    expect(account.balance?.balanceAsOf).toBe("2026-10-02");
    expect(account.balance?.cashBalanceUsd).toBe(10);
    expect(account.balance?.creditBalanceUsd).toBe(20);
    expect(account.checks[0]).toEqual(check);
    expect(account.checks).toHaveLength(2);
    const sibling = row.accounts.find((account) => account.id === second.id);
    assert(sibling);
    expect(sibling.checks).toEqual([]);
    expect(sibling.balance?.cashBalanceUsd ?? null).toBeNull();
    expect(row.unassignedChecks).toHaveLength(1);
    expect(data).toEqual(before);
});

it("resolves exact historical account aliases but leaves ambiguous names unassigned", () => {
    const provider = {
        ...PROVIDER_REGISTRY[0],
        accounts: [
            {
                id: "one",
                label: "Shared label",
                aliases: ["old-one"],
                activeFrom: "2026-01",
                activeTo: null,
            },
            {
                id: "two",
                label: "Shared label",
                activeFrom: "2026-01",
                activeTo: null,
            },
        ],
    };
    const check = { account: "old-one" } as ArchiveCheck;
    expect(reviewAccountId(provider, check)).toBe("one");
    expect(["one", "two"]).not.toContain(
        reviewAccountId(provider, { ...check, account: "Shared label" }),
    );
});

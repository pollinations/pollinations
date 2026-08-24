import assert from "node:assert/strict";
import test from "node:test";
import {
    buildMerchantHistory,
    coveredWiseEntryIds,
    defaultSettledAmount,
    parseDisplayAmount,
    stripHtml,
    transactionProposal,
    wiseEntryId,
} from "./wise-ledger-reconcile.mjs";

const activity = (overrides = {}) => ({
    createdOn: "2026-08-08T12:00:00Z",
    primaryAmount: '<span class="negative">10.00 USD</span>',
    secondaryAmount: '<span class="negative">8.60 EUR</span>',
    resource: { type: "CARD_TRANSACTION", id: "123" },
    status: "COMPLETED",
    title: "<strong>Known vendor</strong>",
    type: "CARD_PAYMENT",
    ...overrides,
});

test("parses Wise direction and stable resource IDs", () => {
    assert.deepEqual(
        parseDisplayAmount('<span class="positive">+ 5.25 EUR</span>'),
        { amount: 5.25, currency: "EUR" },
    );
    assert.equal(wiseEntryId(activity()), "CARD_TRANSACTION-123");
});

test("removes malformed HTML without leaving executable markup", () => {
    assert.equal(
        stripHtml("<script<>alert(1)</script>Known vendor"),
        "alert(1)Known vendor",
    );
});

test("uses the EUR settled amount for a foreign-currency card payment", () => {
    assert.deepEqual(defaultSettledAmount(activity()), {
        amount: -8.6,
        currency: "EUR",
    });
});

test("treats a split reimbursement as coverage of its parent Wise transfer", () => {
    const covered = coveredWiseEntryIds([
        { entry_id: "TRANSFER-2179898016-1" },
        { entry_id: "TRANSFER-2179898016-2" },
        { entry_id: "CARD_TRANSACTION-123" },
    ]);
    assert.equal(covered.has("TRANSFER-2179898016"), true);
    assert.equal(covered.has("CARD_TRANSACTION"), false);
});

test("reuses a ledger-proven merchant classification and amount field", () => {
    const prior = activity({
        resource: { type: "CARD_TRANSACTION", id: "100" },
    });
    const history = buildMerchantHistory(
        [prior],
        [
            {
                entry_id: "CARD_TRANSACTION-100",
                vendor: "known",
                category: "cloud",
                amount: -8.6,
                currency: "EUR",
            },
        ],
    );
    const proposal = transactionProposal(
        activity(),
        history,
        "2026-08-22 12:00:00.000",
        "archive.json",
    );
    assert.deepEqual(proposal.row, {
        entry_id: "CARD_TRANSACTION-123",
        kind: "transaction",
        source: "wise",
        date: "2026-08-08",
        vendor: "known",
        category: "cloud",
        amount: -8.6,
        currency: "EUR",
        description: "Known vendor",
        evidence: "archive.json",
        recorded_at: "2026-08-22 12:00:00.000",
    });
});

test("uses the explicit review mapping for a new known merchant", () => {
    const proposal = transactionProposal(
        activity({ title: "<strong>OpenRouter</strong>" }),
        new Map(),
        "2026-08-22 12:00:00.000",
        "archive.json",
    );
    assert.equal(proposal.row.vendor, "openrouter");
    assert.equal(proposal.row.category, "cloud");
});

test("refuses to guess a genuinely unknown merchant", () => {
    const proposal = transactionProposal(
        activity({ title: "<strong>New merchant</strong>" }),
        new Map(),
        "2026-08-22 12:00:00.000",
        "archive.json",
    );
    assert.equal(proposal.row, undefined);
    assert.deepEqual(proposal.review.issues, ["unmapped merchant"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
    buildMerchantHistory,
    buildStatementSettlements,
    coveredWiseEntryIds,
    defaultSettledAmount,
    parseDisplayAmount,
    parseWiseStatementCsv,
    stripHtml,
    transactionProposal,
    wiseEntryId,
} from "./wise-ledger-reconcile.mjs";

const settlement = (overrides = {}) => ({
    entryId: "CARD_TRANSACTION-123",
    outputEntryId: "CARD_TRANSACTION-123",
    date: "2026-08-09",
    amount: -8.6,
    currency: "EUR",
    ...overrides,
});

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

test("parses quoted Wise statement CSV fields", () => {
    assert.deepEqual(
        parseWiseStatementCsv(
            '"TransferWise ID",Date,Amount,Currency,Description\nCARD-123,09-08-2026,-8.60,EUR,"Vendor, Inc."\n',
        ),
        [
            {
                "TransferWise ID": "CARD-123",
                Date: "09-08-2026",
                Amount: "-8.60",
                Currency: "EUR",
                Description: "Vendor, Inc.",
            },
        ],
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

test("reuses a ledger-proven merchant classification", () => {
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
        settlement(),
    );
    assert.deepEqual(proposal.row, {
        entry_id: "CARD_TRANSACTION-123",
        kind: "transaction",
        source: "wise",
        date: "2026-08-09",
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
        settlement(),
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
        settlement(),
    );
    assert.equal(proposal.row, undefined);
    assert.deepEqual(proposal.review.issues, ["unmapped merchant"]);
});

test("uses statement settlement date and folds statement fees", () => {
    const directDebit = activity({
        resource: { type: "DIRECT_DEBIT_TRANSACTION", id: "32459355" },
        type: "DIRECT_DEBIT_TRANSACTION",
        createdOn: "2026-03-31T23:30:00Z",
    });
    const { byEntryId, unresolved } = buildStatementSettlements(
        [
            {
                "TransferWise ID": "DIRECT_DEBIT-32459355",
                Date: "01-04-2026",
                Amount: "-160.24",
                Currency: "EUR",
            },
            {
                "TransferWise ID": "FEE-DIRECT_DEBIT-32459355",
                Date: "01-04-2026",
                Amount: "-0.50",
                Currency: "EUR",
            },
        ],
        [directDebit],
    );

    assert.deepEqual(unresolved, []);
    assert.deepEqual(byEntryId.get("DIRECT_DEBIT_TRANSACTION-32459355"), [
        {
            entryId: "DIRECT_DEBIT_TRANSACTION-32459355",
            outputEntryId: "DIRECT_DEBIT_TRANSACTION-32459355",
            date: "2026-04-01",
            amount: -160.74,
            currency: "EUR",
        },
    ]);
});

test("keeps multi-balance settlements as separate currency rows", () => {
    const { byEntryId } = buildStatementSettlements(
        [
            {
                "TransferWise ID": "CARD-123",
                Date: "09-08-2026",
                Amount: "-8.60",
                Currency: "EUR",
            },
            {
                "TransferWise ID": "CARD-123",
                Date: "09-08-2026",
                Amount: "-2.00",
                Currency: "USD",
            },
        ],
        [activity()],
    );

    assert.deepEqual(
        byEntryId
            .get("CARD_TRANSACTION-123")
            .map(({ outputEntryId }) => outputEntryId),
        ["CARD_TRANSACTION-123-EUR", "CARD_TRANSACTION-123-USD"],
    );
});

test("refuses to book an activity without a statement settlement", () => {
    const proposal = transactionProposal(
        activity({ title: "<strong>OpenRouter</strong>" }),
        new Map(),
        "2026-08-22 12:00:00.000",
        "archive.json",
        undefined,
    );

    assert.equal(proposal.row, undefined);
    assert.deepEqual(proposal.review.issues, [
        "missing balance-statement settlement",
    ]);
});

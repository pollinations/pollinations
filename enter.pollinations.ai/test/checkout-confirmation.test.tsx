import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
    type CheckoutConfirmationState,
    CheckoutStatusMessage,
} from "../frontend/src/components/pollen/checkout-status-message.tsx";
import {
    afterPoll,
    POLL_START,
    type PollState,
    type SessionStatus,
} from "../frontend/src/lib/checkout-poll.ts";
import { checkoutReturnSearch } from "../frontend/src/lib/top-up-search.ts";

function render(state: CheckoutConfirmationState, onRetry?: () => void) {
    return renderToStaticMarkup(
        <CheckoutStatusMessage state={state} onRetry={onRetry} />,
    );
}

describe("checkout confirmation", () => {
    it.each([
        [{ status: "checking" }, "Adding your Pollen"],
        [{ status: "credited", pollen: 1000 }, "+1,000 Pollen added"],
        [{ status: "timeout" }, "appear when Stripe confirms the payment"],
    ] as const)("says what %j means for the buyer", (state, text) => {
        expect(render(state)).toContain(text);
    });

    it("says added only once the session is credited", () => {
        for (const status of ["checking", "timeout"] as const)
            expect(render({ status })).not.toContain("Pollen added");
    });

    it("offers a new checkout after an expired or failed one", () => {
        for (const status of ["expired", "failed"] as const) {
            expect(render({ status }, () => {})).toContain("Buy again");
            expect(render({ status })).not.toContain("<button");
        }
        expect(render({ status: "failed" })).toContain("No Pollen was added");
    });
});

/**
 * Polls until the answers run out or the polling ends: the line shown last,
 * the polls after which the wallet reloaded, and how many polls were sent.
 */
function runPoll(answers: (SessionStatus | null)[]) {
    let poll: PollState | null = POLL_START;
    let shown: CheckoutConfirmationState = { status: "checking" };
    const reloads: number[] = [];
    let sent = 0;
    for (const answer of answers) {
        if (!poll) break;
        sent++;
        const step = afterPoll(poll, answer);
        if (step.show) shown = step.show;
        if (step.reload) reloads.push(sent);
        poll = step.next;
    }
    return { shown: shown.status, reloads, sent, polling: poll !== null };
}

const PENDING: SessionStatus = { status: "pending" };
const ADDED: SessionStatus = {
    status: "credited",
    pollen: 10,
    bonusPending: false,
};
// The pack is in; the quest check behind its top-up bonus failed.
const ADDED_BONUS_PENDING: SessionStatus = { ...ADDED, bonusPending: true };
const times = <T,>(count: number, answer: T): T[] => Array(count).fill(answer);

describe("checkout confirmation polling", () => {
    it("reloads the wallet once when the pack and its bonus are in", () => {
        expect(runPoll([PENDING, null, ADDED, ADDED])).toEqual({
            shown: "credited",
            reloads: [3],
            sent: 3,
            polling: false,
        });
    });

    it("gives up after 20 polls without a credit", () => {
        expect(runPoll(times(30, PENDING))).toEqual({
            shown: "timeout",
            reloads: [],
            sent: 20,
            polling: false,
        });
    });

    it("stops at once on an expired or failed checkout", () => {
        for (const status of ["expired", "failed"] as const)
            expect(runPoll([PENDING, { status }, ADDED])).toEqual({
                shown: status,
                reloads: [],
                sent: 2,
                polling: false,
            });
    });

    // The pack must show at once, and the bonus must not be missed because
    // the credit came on the last poll.
    it("reloads for the pack, keeps looking, and reloads again when a late bonus is in", () => {
        expect(
            runPoll([
                ...times(19, PENDING),
                ADDED_BONUS_PENDING,
                ADDED_BONUS_PENDING,
                null,
                PENDING,
                ADDED,
                ADDED,
            ]),
        ).toEqual({
            shown: "credited",
            reloads: [20, 24],
            sent: 24,
            polling: false,
        });
    });

    // Lost answers and odd ones don't take "added" back.
    it("looks for a late bonus seven more times, then leaves the pack confirmed", () => {
        for (const before of [0, 19])
            for (const later of [
                ADDED_BONUS_PENDING,
                null,
                { status: "failed" },
            ] as const)
                expect(
                    runPoll([
                        ...times(before, PENDING),
                        ADDED_BONUS_PENDING,
                        ...times(30, later),
                    ]),
                ).toEqual({
                    shown: "credited",
                    reloads: [before + 1],
                    sent: before + 8,
                    polling: false,
                });
    });
});

describe("checkout return search", () => {
    it("reads the session only from a successful Stripe return", () => {
        expect(
            checkoutReturnSearch({
                stripe_success: "true",
                session_id: "cs_test_a1B2",
            }),
        ).toEqual({ session_id: "cs_test_a1B2" });
        for (const search of [
            { session_id: "cs_test_a1B2" },
            { stripe_success: "true" },
            { stripe_success: "true", session_id: "{CHECKOUT_SESSION_ID}" },
            { stripe_success: "true", session_id: "cs_x/../y" },
        ])
            expect(checkoutReturnSearch(search)).toEqual({});
    });
});

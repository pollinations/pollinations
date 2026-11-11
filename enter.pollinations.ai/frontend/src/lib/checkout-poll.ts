import type { CheckoutConfirmationState } from "../components/pollen/checkout-status-message.tsx";

// What the wallet does with each answer about a checkout session, apart from
// the component that asks every 1.5s.

const POLL_ATTEMPTS = 20;
// Polls after "credited" while a top-up bonus is still on its way: about 10s.
const BONUS_POLL_ATTEMPTS = 7;

/** GET /api/stripe/checkout/sessions/:id */
export type SessionStatus =
    | { status: "credited"; pollen: number; bonusPending: boolean }
    | { status: "pending" | "expired" | "failed" };

export type PollState = {
    /** Polls still to send, this one included. */
    pollsLeft: number;
    /** An earlier answer already said the pack is in. */
    credited: boolean;
};

export const POLL_START: PollState = {
    pollsLeft: POLL_ATTEMPTS,
    credited: false,
};

/**
 * What one answer (null: none arrived) means: the line to show, if any,
 * whether the wallet reloads, and the next poll, or null when polling ends.
 * The wallet reloads when the pack is in, and once more when a top-up bonus
 * that was still on its way is in too.
 */
export function afterPoll(
    poll: PollState,
    answer: SessionStatus | null,
): {
    show?: CheckoutConfirmationState;
    reload: boolean;
    next: PollState | null;
} {
    const pollsLeft = poll.pollsLeft - 1;
    if (answer?.status === "credited") {
        // A credit on the last poll still gets its full time for the bonus.
        const bonusPolls = poll.credited ? pollsLeft : BONUS_POLL_ATTEMPTS;
        return {
            show: { status: "credited", pollen: answer.pollen },
            reload: !poll.credited || !answer.bonusPending,
            next:
                answer.bonusPending && bonusPolls > 0
                    ? { pollsLeft: bonusPolls, credited: true }
                    : null,
        };
    }
    // The pack is in and stays "added", whatever a later answer says.
    if (poll.credited) {
        return {
            reload: false,
            next: pollsLeft > 0 ? { pollsLeft, credited: true } : null,
        };
    }
    if (answer?.status === "expired" || answer?.status === "failed") {
        return { show: { status: answer.status }, reload: false, next: null };
    }
    return pollsLeft > 0
        ? { reload: false, next: { pollsLeft, credited: false } }
        : { show: { status: "timeout" }, reload: false, next: null };
}

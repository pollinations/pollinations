import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import {
    afterPoll,
    POLL_START,
    type PollState,
    type SessionStatus,
} from "../../lib/checkout-poll.ts";
import {
    type CheckoutConfirmationState,
    CheckoutStatusMessage,
} from "./checkout-status-message.tsx";

const POLL_INTERVAL_MS = 1500;

type CheckoutConfirmationProps = {
    sessionId: string;
    /**
     * Reload the wallet and billing once the Pollen is in, and once more
     * when a top-up bonus follows it.
     */
    onCredited?: () => void;
    /** Start a new checkout after an expired or failed one. */
    onRetry?: () => void;
};

/**
 * Says "added" only once the webhook credited the session, polling every
 * 1.5s for about 30s. Covers the modal after Pay and the return from
 * redirect-based methods or hosted Checkout.
 */
export const CheckoutConfirmation: FC<CheckoutConfirmationProps> = ({
    sessionId,
    onCredited,
    onRetry,
}) => {
    const [state, setState] = useState<CheckoutConfirmationState>({
        status: "checking",
    });
    const onCreditedRef = useRef(onCredited);
    onCreditedRef.current = onCredited;

    useEffect(() => {
        let canceled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        async function poll(current: PollState): Promise<void> {
            const answer = await apiClient.stripe.checkout.sessions[
                ":sessionId"
            ]
                .$get({ param: { sessionId } })
                .then(
                    async (response): Promise<SessionStatus | null> =>
                        response.ok ? await response.json() : null,
                )
                .catch(() => null);
            if (canceled) return;
            const { show, reload, next } = afterPoll(current, answer);
            if (show) setState(show);
            if (reload) onCreditedRef.current?.();
            if (next) {
                timer = setTimeout(() => void poll(next), POLL_INTERVAL_MS);
            }
        }
        void poll(POLL_START);
        return () => {
            canceled = true;
            clearTimeout(timer);
        };
    }, [sessionId]);

    return <CheckoutStatusMessage state={state} onRetry={onRetry} />;
};

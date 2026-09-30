import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import {
    type CheckoutConfirmationState,
    CheckoutStatusMessage,
} from "./checkout-status-message.tsx";

const POLL_INTERVAL_MS = 1500;
const POLL_ATTEMPTS = 20;

/** GET /api/stripe/checkout/sessions/:id */
type SessionStatus =
    | { status: "credited"; pollen: number }
    | { status: "pending" | "expired" };

type CheckoutConfirmationProps = {
    sessionId: string;
    /** Reload the wallet and billing once the Pollen is in. */
    onCredited?: () => void;
    /** Start a new checkout after an expired one. */
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
        async function poll(attempt: number): Promise<void> {
            const next = await apiClient.stripe.checkout.sessions[":sessionId"]
                .$get({ param: { sessionId } })
                .then(
                    async (response): Promise<SessionStatus | null> =>
                        response.ok ? await response.json() : null,
                )
                .catch(() => null);
            if (canceled) return;
            if (next?.status === "credited") {
                setState(next);
                onCreditedRef.current?.();
                return;
            }
            if (next?.status === "expired")
                return setState({ status: "expired" });
            if (attempt + 1 >= POLL_ATTEMPTS) {
                setState({ status: "timeout" });
                return;
            }
            timer = setTimeout(() => void poll(attempt + 1), POLL_INTERVAL_MS);
        }
        void poll(0);
        return () => {
            canceled = true;
            clearTimeout(timer);
        };
    }, [sessionId]);

    return <CheckoutStatusMessage state={state} onRetry={onRetry} />;
};

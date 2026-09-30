import {
    Button,
    CheckIcon,
    ClockIcon,
    LoadingStatus,
    RefreshIcon,
    WarningIcon,
} from "@pollinations/ui";
import { formatPollenPackValue } from "@shared/pollen-packs.ts";
import type { FC, ReactNode } from "react";

/** What the wallet knows about a Checkout Session, newest first. */
export type CheckoutConfirmationState =
    | { status: "checking" }
    | { status: "credited"; pollen: number }
    | { status: "open" | "paid" | "processing" | "failed" | "expired" }
    | { status: "timeout" };

export const CheckoutStatusMessage: FC<{
    state: CheckoutConfirmationState;
    onRetry?: () => void;
}> = ({ state, onRetry }) => {
    switch (state.status) {
        case "checking":
        case "open":
            return <LoadingStatus>Confirming your payment…</LoadingStatus>;
        case "paid":
            return (
                <LoadingStatus>
                    Payment received — adding your Pollen…
                </LoadingStatus>
            );
        case "credited":
            return (
                <StatusLine icon={<CheckIcon />}>
                    <strong className="font-semibold text-theme-text-base">
                        +{formatPollenPackValue(state.pollen)} Pollen added
                    </strong>
                </StatusLine>
            );
        case "processing":
            return (
                <StatusLine icon={<ClockIcon />}>
                    <strong className="font-semibold text-theme-text-base">
                        Payment processing
                    </strong>{" "}
                    — your bank is confirming it. Pollen is added once it
                    succeeds.
                </StatusLine>
            );
        case "failed":
            return (
                <RetryMessage
                    icon={<WarningIcon />}
                    message="Payment didn’t go through."
                    action="Try again"
                    onRetry={onRetry}
                />
            );
        case "expired":
            return (
                <RetryMessage
                    icon={<ClockIcon />}
                    message="Checkout expired."
                    action="Buy again"
                    onRetry={onRetry}
                />
            );
        case "timeout":
            return (
                <StatusLine icon={<ClockIcon />}>
                    Your Pollen will appear when Stripe confirms the payment.
                </StatusLine>
            );
    }
};

const StatusLine: FC<{ icon: ReactNode; children: ReactNode }> = ({
    icon,
    children,
}) => (
    <p className="flex items-start gap-2 text-sm leading-5 text-theme-text-muted">
        <span
            aria-hidden="true"
            className="mt-0.5 flex h-4 w-4 shrink-0 [&>svg]:h-full [&>svg]:w-full"
        >
            {icon}
        </span>
        <span>{children}</span>
    </p>
);

const RetryMessage: FC<{
    icon: ReactNode;
    message: string;
    action: string;
    onRetry?: () => void;
}> = ({ icon, message, action, onRetry }) => (
    <div className="flex flex-col items-start gap-3">
        <StatusLine icon={icon}>{message}</StatusLine>
        {onRetry && (
            <Button icon={<RefreshIcon />} onClick={onRetry}>
                {action}
            </Button>
        )}
    </div>
);

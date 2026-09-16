import { Chip } from "../../primitives/Chip.tsx";
import { InlineLink } from "../../primitives/InlineLink.tsx";
import { KeyIcon, WalletIcon } from "../../primitives/icons/index.tsx";
import { WalletKindIcon } from "./wallet-display.tsx";

export type PollenStatus = {
    state: "no-pollen" | "limit-reached" | "paid-required";
};

const labels = {
    "no-pollen": "No Pollen",
    "limit-reached": "Limit reached",
    "paid-required": "Paid required",
} as const;

const intents = {
    "no-pollen": "danger",
    "limit-reached": "danger",
    "paid-required": "warning",
} as const;

/** The caller supplies a confirmed status; this component does not infer affordability. */
export function PollenStatusBadge({
    state,
    topUpHref,
}: PollenStatus & { topUpHref?: string }) {
    const budgetState = state === "limit-reached";
    const label = labels[state];
    return (
        <Chip
            size="sm"
            intent={intents[state]}
            aria-label={state === "paid-required" ? `Paid: ${label}` : label}
        >
            {state === "paid-required" ? (
                <WalletKindIcon kind="paid" />
            ) : budgetState ? (
                <KeyIcon
                    aria-hidden="true"
                    className="polli:h-3.5 polli:w-3.5 polli:shrink-0"
                />
            ) : (
                <WalletIcon
                    aria-hidden="true"
                    className="polli:h-3.5 polli:w-3.5 polli:shrink-0"
                />
            )}
            {label}
            {!budgetState && topUpHref && (
                <>
                    <span aria-hidden="true">·</span>
                    <InlineLink
                        href={topUpHref}
                        external
                        showIcon={false}
                        data-pollinations-action="fund-account"
                        aria-label={`${label}. Top up (opens in a new tab)`}
                        className="polli:text-current polli:hover:text-current"
                    >
                        Top up
                    </InlineLink>
                </>
            )}
        </Chip>
    );
}

import { Chip } from "../../primitives/Chip.tsx";
import { InlineLink } from "../../primitives/InlineLink.tsx";
import { KeyIcon, WalletIcon } from "../../primitives/icons/index.tsx";
import { WalletKindIcon } from "./wallet-display.tsx";

export type PollenStatus = {
    state: "no-pollen" | "limit-reached" | "paid-required";
    wallet?: "paid" | "tier";
};

const labels = {
    "no-pollen": "No Pollen",
    "limit-reached": "Limit reached",
    "paid-required": "Paid required",
} as const;

/** The caller supplies a confirmed status; this component does not infer affordability. */
export function PollenStatusBadge({
    state,
    wallet,
    showIcon = true,
    topUpHref,
}: PollenStatus & { showIcon?: boolean; topUpHref?: string }) {
    const allowance = state === "limit-reached";
    const kind = state === "paid-required" ? "paid" : wallet;
    const Icon = allowance ? KeyIcon : WalletIcon;
    const label = labels[state];
    return (
        <Chip
            size="sm"
            intent={
                state === "no-pollen" || state === "limit-reached"
                    ? "danger"
                    : "warning"
            }
            aria-label={
                kind && !allowance
                    ? `${kind === "tier" ? "Quest" : "Paid"}: ${label}`
                    : label
            }
        >
            {showIcon &&
                (kind && !allowance ? (
                    <WalletKindIcon kind={kind} />
                ) : (
                    <Icon
                        aria-hidden="true"
                        className="polli:h-3.5 polli:w-3.5 polli:shrink-0"
                    />
                ))}
            {label}
            {!allowance && topUpHref && (
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

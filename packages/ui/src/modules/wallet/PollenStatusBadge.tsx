import { Chip } from "../../primitives/Chip.tsx";
import { InlineLink } from "../../primitives/InlineLink.tsx";
import { KeyIcon, WalletIcon } from "../../primitives/icons/index.tsx";

export type PollenStatus = "limit-reached" | "no-pollen" | "unlimited";

const labels: Record<PollenStatus, string> = {
    "limit-reached": "Limit reached",
    "no-pollen": "No Pollen",
    unlimited: "Unlimited",
};

/** Chip for an app budget that is unlimited or exhausted, or an empty wallet. */
export function PollenStatusBadge({
    state,
    topUpHref,
}: {
    state: PollenStatus;
    /** Wallet only; a menu keeps recovery links in its dropdown. */
    topUpHref?: string;
}) {
    const Icon = state === "no-pollen" ? WalletIcon : KeyIcon;
    const label = labels[state];
    return (
        <Chip
            size="sm"
            intent={state === "unlimited" ? "info" : "danger"}
            aria-label={label}
        >
            <Icon
                aria-hidden="true"
                className="polli:h-3.5 polli:w-3.5 polli:shrink-0"
            />
            {label}
            {state === "no-pollen" && topUpHref && (
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

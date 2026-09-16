import { Chip } from "../../primitives/Chip.tsx";
import { InlineLink } from "../../primitives/InlineLink.tsx";
import { KeyIcon, WalletIcon } from "../../primitives/icons/index.tsx";
import { formatPollen } from "./format-pollen.ts";
import { WalletKindIcon } from "./wallet-display.tsx";

export type AccountPollenSource =
    | {
          type: "wallet";
          /** Undefined while the balance is unavailable. */
          balances?: { paid: number; quest: number };
      }
    | {
          type: "budget";
          /** The app's remaining budget, never the owner's wallet total. `null` = unlimited. */
          remaining?: number | null;
          generationEnabled?: boolean;
      };

function isEmpty(amount: number | null | undefined): boolean {
    return amount != null && amount <= 0;
}

type PollenStatus = "limit-reached" | "no-pollen" | "unlimited";

const labels: Record<PollenStatus, string> = {
    "limit-reached": "Limit reached",
    "no-pollen": "No Pollen",
    unlimited: "Unlimited",
};

function PollenStatusBadge({
    state,
    topUpHref,
}: {
    state: PollenStatus;
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

/** Icon + amount; unlimited, exhausted, or empty states become a badge. */
export function AccountPollen({
    source,
    topUpHref,
}: {
    source: AccountPollenSource;
    /** Shown in the empty-wallet badge. A menu keeps recovery links in its dropdown. */
    topUpHref?: string;
}) {
    if (source.type === "budget") {
        if (source.generationEnabled === false) return null;
        // null is the API's explicit "no budget"; undefined is not loaded yet.
        const unlimited = source.remaining === null;
        if (!unlimited && source.remaining === undefined) return null;
        if (unlimited) return <PollenStatusBadge state="unlimited" />;
        const remaining = source.remaining as number;
        if (isEmpty(remaining))
            return <PollenStatusBadge state="limit-reached" />;
        return (
            <span
                title="App budget left"
                className="polli:inline-flex polli:items-center polli:gap-1 polli:tabular-nums"
            >
                <KeyIcon
                    aria-hidden="true"
                    className="polli:h-3.5 polli:w-3.5 polli:shrink-0"
                />
                <span className="polli:sr-only">App budget: </span>
                {formatPollen(remaining)} pollen
            </span>
        );
    }
    const { balances } = source;
    if (!balances) return null;
    if (isEmpty(balances.paid) && isEmpty(balances.quest))
        return <PollenStatusBadge state="no-pollen" topUpHref={topUpHref} />;
    return (
        <span className="polli:inline-flex polli:items-center polli:gap-2 polli:tabular-nums">
            {/* Quest Pollen is spent first, so it comes first. */}
            {(["quest", "paid"] as const).map((kind) => {
                const amount = balances[kind];
                return (
                    <span
                        key={kind}
                        className="polli:inline-flex polli:items-center polli:gap-1"
                    >
                        <WalletKindIcon
                            kind={kind === "paid" ? "paid" : "tier"}
                        />
                        <span className="polli:sr-only">
                            {kind === "paid" ? "Paid" : "Quest"} Pollen:{" "}
                        </span>
                        {formatPollen(Math.max(0, amount))}
                    </span>
                );
            })}
        </span>
    );
}

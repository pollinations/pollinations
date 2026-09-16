import { cn } from "../../lib/cn.ts";
import { InlineLink } from "../../primitives/InlineLink.tsx";
import { KeyIcon } from "../../primitives/icons/index.tsx";
import { formatPollen } from "./format-pollen.ts";
import { WalletKindIcon } from "./wallet-display.tsx";

export type AccountPollenSource =
    | {
          type: "wallet";
          /** undefined = not loaded yet, null = failed to load. */
          balances?: { paid: number; quest: number } | null;
      }
    | {
          type: "budget";
          /** The app's remaining budget, never the owner's wallet total. `null` = unlimited. */
          remaining?: number | null;
          generationEnabled?: boolean;
          /** Spell out the unit when the budget stands alone on the line. */
          withUnit?: boolean;
      };

const emptyClass = "polli:text-intent-danger-text";

function isEmpty(amount: number | null | undefined): boolean {
    return amount != null && Number.isFinite(amount) && amount <= 0;
}

/** Icon + amount; the amount turns red at zero. */
export function AccountPollen({
    source,
    topUpHref,
}: {
    source: AccountPollenSource;
    /** Shown after an empty wallet. A menu keeps recovery links in its dropdown. */
    topUpHref?: string;
}) {
    if (source.type === "budget") {
        if (source.generationEnabled === false) return null;
        // null is the API's explicit "no budget"; undefined is not loaded yet.
        const unlimited = source.remaining === null;
        if (
            !unlimited &&
            (source.remaining == null || !Number.isFinite(source.remaining))
        )
            return null;
        const remaining = source.remaining as number;
        return (
            <span
                title={unlimited ? "Unlimited app budget" : "App budget left"}
                aria-label={
                    unlimited
                        ? "Unlimited app budget"
                        : `App budget left: ${formatPollen(remaining)}`
                }
                className={cn(
                    "polli:inline-flex polli:items-center polli:gap-1 polli:tabular-nums",
                    !unlimited && isEmpty(remaining) && emptyClass,
                )}
            >
                <KeyIcon
                    aria-hidden="true"
                    className="polli:h-3.5 polli:w-3.5 polli:shrink-0"
                />
                {unlimited ? "∞" : formatPollen(Math.max(0, remaining))}
                {source.withUnit && " pollen"}
            </span>
        );
    }
    if (source.balances === undefined) return null;
    const { balances } = source;
    const walletEmpty =
        balances != null && isEmpty(balances.paid) && isEmpty(balances.quest);
    return (
        <span className="polli:inline-flex polli:items-center polli:gap-2 polli:tabular-nums">
            {/* Quest Pollen is spent first, so it comes first. */}
            {(["quest", "paid"] as const).map((kind) => {
                const amount = balances?.[kind];
                return (
                    <span
                        key={kind}
                        className={cn(
                            "polli:inline-flex polli:items-center polli:gap-1",
                            isEmpty(amount) && emptyClass,
                        )}
                    >
                        <WalletKindIcon
                            kind={kind === "paid" ? "paid" : "tier"}
                        />
                        <span className="polli:sr-only">
                            {kind === "paid" ? "Paid" : "Quest"} Pollen:{" "}
                        </span>
                        {amount != null && Number.isFinite(amount)
                            ? formatPollen(Math.max(0, amount))
                            : "…"}
                    </span>
                );
            })}
            {walletEmpty && topUpHref && (
                <>
                    <span aria-hidden="true">·</span>
                    <InlineLink
                        href={topUpHref}
                        external
                        showIcon={false}
                        data-pollinations-action="fund-account"
                        aria-label="No Pollen. Top up (opens in a new tab)"
                    >
                        Top up
                    </InlineLink>
                </>
            )}
        </span>
    );
}

import { InfinityIcon, KeyIcon } from "../../primitives/icons/index.tsx";
import { formatPollen } from "./format-pollen.ts";
import { PollenStatusBadge } from "./PollenStatusBadge.tsx";
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
      };

function isEmpty(amount: number | null | undefined): boolean {
    return amount != null && Number.isFinite(amount) && amount <= 0;
}

/** Icon + amount; an exhausted budget or empty wallet becomes a red badge. */
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
        if (
            !unlimited &&
            (source.remaining == null || !Number.isFinite(source.remaining))
        )
            return null;
        const remaining = source.remaining as number;
        if (!unlimited && isEmpty(remaining))
            return <PollenStatusBadge state="limit-reached" />;
        return (
            <span
                title={unlimited ? "Unlimited app budget" : "App budget left"}
                className="polli:inline-flex polli:items-center polli:gap-1 polli:tabular-nums"
            >
                <KeyIcon
                    aria-hidden="true"
                    className="polli:h-3.5 polli:w-3.5 polli:shrink-0"
                />
                <span className="polli:sr-only">App budget: </span>
                {unlimited ? (
                    <>
                        <InfinityIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                        <span className="polli:sr-only">unlimited</span>
                    </>
                ) : (
                    formatPollen(remaining)
                )}
                {unlimited ? "pollen" : " pollen"}
            </span>
        );
    }
    if (source.balances === undefined) return null;
    const { balances } = source;
    if (balances && isEmpty(balances.paid) && isEmpty(balances.quest))
        return <PollenStatusBadge state="no-pollen" topUpHref={topUpHref} />;
    return (
        <span className="polli:inline-flex polli:items-center polli:gap-2 polli:tabular-nums">
            {/* Quest Pollen is spent first, so it comes first. */}
            {(["quest", "paid"] as const).map((kind) => {
                const amount = balances?.[kind];
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
                        {amount != null && Number.isFinite(amount)
                            ? formatPollen(Math.max(0, amount))
                            : "…"}
                    </span>
                );
            })}
        </span>
    );
}

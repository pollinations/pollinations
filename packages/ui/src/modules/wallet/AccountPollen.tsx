import { KeyIcon } from "../../primitives/icons/index.tsx";
import { formatPollen } from "./format-pollen.ts";
import { type PollenStatus, PollenStatusBadge } from "./PollenStatusBadge.tsx";
import { WalletKindIcon } from "./wallet-display.tsx";

export type AccountPollenSource =
    | {
          type: "wallet";
          /** Undefined while the balance is unavailable. */
          balances?: { paid: number; quest: number };
          /** None covers disabled generation and a selection of free models. */
          requirement?: "any" | "paid" | "none";
      }
    | {
          type: "budget";
          /** The app's remaining budget, never the owner's wallet total. `null` = unlimited. */
          remaining?: number | null;
          generationEnabled?: boolean;
      };

function getStatus(source: AccountPollenSource): PollenStatus | undefined {
    if (source.type === "budget") {
        if (
            source.generationEnabled === false ||
            source.remaining === undefined
        )
            return undefined;
        if (source.remaining === null) return { state: "unlimited" };
        return source.remaining <= 0 ? { state: "limit-reached" } : undefined;
    }
    const { balances, requirement = "any" } = source;
    if (!balances || requirement === "none" || balances.paid > 0)
        return undefined;
    if (requirement === "paid") return { state: "paid-required" };
    return balances.quest <= 0 ? { state: "no-pollen" } : undefined;
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
    const status = getStatus(source);
    if (status) return <PollenStatusBadge {...status} topUpHref={topUpHref} />;
    if (source.type === "budget") {
        if (source.generationEnabled === false) return null;
        if (source.remaining == null) return null;
        const remaining = source.remaining as number;
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

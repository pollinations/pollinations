import { KeyIcon } from "../../primitives/icons/index.tsx";
import { formatPollen } from "./format-pollen.ts";
import { type PollenStatus, PollenStatusBadge } from "./PollenStatusBadge.tsx";
import { WalletKindIcon } from "./wallet-display.tsx";

export type AccountPollenSource =
    | {
          type: "wallet";
          balances?: { paid: number; quest: number } | null;
          /** None covers disabled generation and a selection of free models. */
          requirement?: "any" | "paid" | "none";
      }
    | {
          type: "allowance";
          /** The app's remaining budget, never the owner's wallet total. */
          remaining?: number | null;
          generationEnabled?: boolean;
      };

/** Only confirmed values can replace amounts with a warning. */
export function getAccountPollenStatus(
    source: AccountPollenSource,
): PollenStatus | undefined {
    if (source.type === "allowance") {
        return source.generationEnabled !== false &&
            source.remaining != null &&
            Number.isFinite(source.remaining) &&
            source.remaining <= 0
            ? { state: "limit-reached" }
            : undefined;
    }
    const { balances, requirement = "any" } = source;
    if (!balances || requirement === "none") return undefined;
    if (!Number.isFinite(balances.paid) || balances.paid > 0) return undefined;
    if (requirement === "paid") return { state: "paid-required" };
    return Number.isFinite(balances.quest) && balances.quest <= 0
        ? { state: "no-pollen" }
        : undefined;
}

/** Shared secondary line for a static identity or a menu trigger. */
export function AccountPollen({
    source,
    topUpHref,
}: {
    source: AccountPollenSource;
    /** Static identity only. A menu keeps recovery links in its dropdown. */
    topUpHref?: string;
}) {
    const status = getAccountPollenStatus(source);
    if (status) return <PollenStatusBadge {...status} topUpHref={topUpHref} />;
    if (source.type === "allowance") {
        if (
            source.generationEnabled === false ||
            source.remaining == null ||
            !Number.isFinite(source.remaining)
        )
            return null;
        return (
            <span
                title="Available app Pollen"
                className="polli:inline-flex polli:items-center polli:gap-1 polli:tabular-nums"
            >
                <KeyIcon
                    aria-hidden="true"
                    className="polli:h-3.5 polli:w-3.5 polli:shrink-0"
                />
                {formatPollen(source.remaining)} Pollen
            </span>
        );
    }
    if (source.balances === undefined) return null;
    return (
        <span className="polli:inline-flex polli:items-center polli:gap-2 polli:tabular-nums">
            {(["paid", "quest"] as const).map((kind) => {
                const amount = source.balances?.[kind];
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

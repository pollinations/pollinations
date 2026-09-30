import { Button, SproutIcon, Surface, WalletIcon } from "@pollinations/ui";
import {
    calculateServiceFeeCents,
    formatUsdCentsCompact,
    POLLEN_PACKS,
    SERVICE_FEE_NAME,
} from "@shared/pollen-packs.ts";
import { type FC, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";
import { PackSliderRow, PollenPackSlider } from "./pollen-pack-controls.tsx";

const TOP_UP_QUEST_ID = "top_up_since_launch";

type PollenPackPurchaseProps = {
    selectedPackAmount: number;
    onSelectedPackAmountChange: (amount: number) => void;
    /** Standalone /top-up: Stripe returns there, carrying the app link. */
    returnToTopUp?: { redirect?: string };
    /** The buyer's IP country, for the local payment logos. */
    ipCountry?: string | null;
};

/** The pack slider and Buy button: the one thing a top-up needs. */
export const PollenPackPurchase: FC<PollenPackPurchaseProps> = ({
    selectedPackAmount,
    onSelectedPackAmountChange,
    returnToTopUp,
    ipCountry,
}) => {
    const topUpBonus = useTopUpBonus();
    const selectedPackIndex = Math.max(
        0,
        POLLEN_PACKS.findIndex((pack) => pack.amountUsd === selectedPackAmount),
    );
    const selectedPack = POLLEN_PACKS[selectedPackIndex] ?? POLLEN_PACKS[0];
    if (!selectedPack) return null;
    const serviceFeeCents = calculateServiceFeeCents(
        selectedPack.amountUsd * 100,
    );
    const chargeLabel = formatUsdCentsCompact(
        selectedPack.amountUsd * 100 + serviceFeeCents,
    );
    const checkoutParams = new URLSearchParams();
    if (returnToTopUp) {
        checkoutParams.set("return", "top-up");
        if (returnToTopUp.redirect)
            checkoutParams.set("redirect", returnToTopUp.redirect);
    }
    const checkoutQuery = checkoutParams.toString();
    const checkoutHref =
        `/api/stripe/checkout/${selectedPack.packKey}` +
        (checkoutQuery ? `?${checkoutQuery}` : "");

    // The charged total (pack + service fee) appears once, on the button that
    // charges it; the fee breakdown and tax treatment sit right under it.
    return (
        <Surface className="flex flex-col gap-3">
            <PackSliderRow
                slider={
                    <PollenPackSlider
                        value={selectedPack.amountUsd}
                        onChange={onSelectedPackAmountChange}
                    />
                }
                action={
                    <Button
                        as="a"
                        href={checkoutHref}
                        intent="commit"
                        size="lg"
                        icon={<WalletIcon />}
                        className="w-full tabular-nums"
                    >
                        Buy for {chargeLabel}
                    </Button>
                }
            />
            {topUpBonus && (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-intent-success-text">
                    <SproutIcon aria-hidden="true" className="h-4 w-4" />+
                    {topUpBonus} Quest Pollen bonus with this top-up
                </p>
            )}
            <p className="text-[13px] leading-snug text-theme-text-muted">
                Includes {formatUsdCentsCompact(serviceFeeCents)}{" "}
                {SERVICE_FEE_NAME.toLowerCase()} · Tax calculated at checkout
            </p>
            <PaymentTrustBadge className="mt-0 pt-0" country={ipCountry} />
        </Surface>
    );
};

/**
 * The top-up quest reward while it is still unearned. The Stripe webhook
 * credits it with the pack, so the buyer gets it with this purchase.
 */
function useTopUpBonus(): number | null {
    const [bonus, setBonus] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const [catalogResponse, rewardsResponse] = await Promise.all([
                apiClient.quests.catalog.$get(),
                apiClient.quests.rewards.$get(),
            ]);
            if (!catalogResponse.ok || !rewardsResponse.ok) return;
            const [{ quests }, { rewards }] = await Promise.all([
                catalogResponse.json(),
                rewardsResponse.json(),
            ]);
            const quest = quests.find((q) => q.id === TOP_UP_QUEST_ID);
            const earned = rewards.some((r) => r.questId === TOP_UP_QUEST_ID);
            if (!cancelled && quest?.state === "available" && !earned) {
                setBonus(quest.rewardAmount);
            }
        };
        // No bonus line when quests can't load; checkout still works.
        load().catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    return bonus;
}

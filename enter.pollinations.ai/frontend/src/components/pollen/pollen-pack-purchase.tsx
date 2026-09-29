import { Button, Surface, WalletIcon } from "@pollinations/ui";
import {
    calculateServiceFeeCents,
    formatUsdCentsCompact,
    POLLEN_PACKS,
    SERVICE_FEE_NAME,
} from "@shared/pollen-packs.ts";
import type { FC } from "react";
import { useState } from "react";
import { PackCheckoutDialog } from "./pack-checkout-dialog.tsx";
import { PackSliderRow, PollenPackSlider } from "./pollen-pack-controls.tsx";

type PollenPackPurchaseProps = {
    selectedPackAmount: number;
    onSelectedPackAmountChange: (amount: number) => void;
    /** Standalone /top-up: Stripe returns there, carrying the app link. */
    returnToTopUp?: { redirect?: string };
    /** Reload the wallet and billing once a purchase is credited. */
    onCredited?: () => void;
};

/** The pack slider and Buy button: the one thing a top-up needs. */
export const PollenPackPurchase: FC<PollenPackPurchaseProps> = ({
    selectedPackAmount,
    onSelectedPackAmountChange,
    returnToTopUp,
    onCredited,
}) => {
    const [checkoutOpen, setCheckoutOpen] = useState(false);
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
                        onClick={() => setCheckoutOpen(true)}
                        size="lg"
                        icon={<WalletIcon />}
                        className="w-full tabular-nums"
                    >
                        Buy for {chargeLabel}
                    </Button>
                }
            />
            <p className="text-[13px] leading-snug text-theme-text-muted">
                Includes {formatUsdCentsCompact(serviceFeeCents)}{" "}
                {SERVICE_FEE_NAME.toLowerCase()} · Tax calculated at checkout
            </p>
            <PackCheckoutDialog
                open={checkoutOpen}
                onOpenChange={setCheckoutOpen}
                pack={selectedPack}
                checkoutQuery={checkoutQuery}
                onCredited={onCredited}
            />
        </Surface>
    );
};

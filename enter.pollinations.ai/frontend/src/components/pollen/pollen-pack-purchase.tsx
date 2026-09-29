import { Surface } from "@pollinations/ui";
import { POLLEN_PACKS, SERVICE_FEE_NAME } from "@shared/pollen-packs.ts";
import type { FC } from "react";
import { useState } from "react";
import { PackCheckoutDialog } from "./pack-checkout-dialog.tsx";
import { PollenPackButtons } from "./pollen-pack-controls.tsx";

type PollenPackPurchaseProps = {
    selectedPackAmount: number;
    onSelectedPackAmountChange: (amount: number) => void;
    /** Standalone /top-up: Stripe returns there, carrying the app link. */
    returnToTopUp?: { redirect?: string };
    /** Reload the wallet and billing once a purchase is credited. */
    onCredited?: () => void;
};

/**
 * The pack buttons: the one thing a top-up needs. A pack opens checkout for
 * it, so a returning buyer tops up in two clicks: pack → Confirm.
 */
export const PollenPackPurchase: FC<PollenPackPurchaseProps> = ({
    selectedPackAmount,
    onSelectedPackAmountChange,
    returnToTopUp,
    onCredited,
}) => {
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    // The clicked pack, not the URL's: the URL catches up a render later.
    const [checkoutPack, setCheckoutPack] = useState(
        () =>
            POLLEN_PACKS.find(
                (pack) => pack.amountUsd === selectedPackAmount,
            ) ?? POLLEN_PACKS[0],
    );
    if (!checkoutPack) return null;
    const checkoutParams = new URLSearchParams();
    if (returnToTopUp) {
        checkoutParams.set("return", "top-up");
        if (returnToTopUp.redirect)
            checkoutParams.set("redirect", returnToTopUp.redirect);
    }

    return (
        <Surface className="flex flex-col gap-3">
            <PollenPackButtons
                selectedAmount={
                    checkoutOpen ? checkoutPack.amountUsd : undefined
                }
                onSelect={(pack) => {
                    onSelectedPackAmountChange(pack.amountUsd);
                    setCheckoutPack(pack);
                    setCheckoutOpen(true);
                }}
            />
            <p className="text-[13px] leading-snug text-theme-text-muted">
                Prices include the {SERVICE_FEE_NAME.toLowerCase()} · Tax
                calculated at checkout
            </p>
            <PackCheckoutDialog
                open={checkoutOpen}
                onOpenChange={setCheckoutOpen}
                pack={checkoutPack}
                checkoutQuery={checkoutParams.toString()}
                onCredited={onCredited}
            />
        </Surface>
    );
};

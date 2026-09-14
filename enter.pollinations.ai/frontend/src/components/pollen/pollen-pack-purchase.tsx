import {
    ExternalLinkButton,
    Surface,
    Tooltip,
    WalletIcon,
} from "@pollinations/ui";
import {
    calculateServiceFeeCents,
    formatUsdCentsCompact,
    POLLEN_PACKS,
} from "@shared/pollen-packs.ts";
import type { FC } from "react";
import { PollenPackSlider } from "./pollen-pack-controls.tsx";

type PollenPackPurchaseProps = {
    selectedPackAmount: number;
    onSelectedPackAmountChange: (amount: number) => void;
    /** Standalone /top-up: Stripe returns there, carrying the app link. */
    returnToTopUp?: { redirect?: string };
};

/** The pack slider and Buy button: the one thing a top-up needs. */
export const PollenPackPurchase: FC<PollenPackPurchaseProps> = ({
    selectedPackAmount,
    onSelectedPackAmountChange,
    returnToTopUp,
}) => {
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

    return (
        <Surface>
            <div className="flex w-full flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-4 sm:pb-20">
                <div className="w-full min-w-0 flex-1 pb-20 sm:pb-0">
                    <PollenPackSlider
                        value={selectedPack.amountUsd}
                        onChange={onSelectedPackAmountChange}
                        selectedBadgeLabel={chargeLabel}
                        selectedBadgeDetail={`incl. ${formatUsdCentsCompact(serviceFeeCents)} fee`}
                    />
                </div>
                <Tooltip
                    content={
                        <span className="block">
                            Buy{" "}
                            <span className="font-semibold text-theme-text-strong">
                                {selectedPack.amountUsd} pollen
                            </span>{" "}
                            for{" "}
                            <span className="font-semibold text-theme-text-strong">
                                {chargeLabel}
                            </span>
                            <span className="mt-1 block text-theme-text-muted">
                                Tax calculated at checkout
                            </span>
                        </span>
                    }
                    displayContents
                >
                    <ExternalLinkButton
                        href={checkoutHref}
                        target="_self"
                        className="w-28 min-w-0 gap-1.5 self-start text-center shadow-none sm:shrink-0 sm:self-center"
                    >
                        <span className="inline-flex items-center gap-1.5">
                            <WalletIcon className="h-4 w-4 shrink-0" />
                            Buy
                        </span>
                    </ExternalLinkButton>
                </Tooltip>
            </div>
        </Surface>
    );
};

import {
    Alert,
    Button,
    CopyButton,
    GiftIcon,
    InlineLink,
    Surface,
    Tooltip,
    WalletIcon,
} from "@pollinations/ui";
import {
    POLLEN_GIFT_DEFAULT_AMOUNT,
    POLLEN_GIFT_PACKS,
} from "@shared/pollen-gifts.ts";
import {
    calculateServiceFeeCents,
    formatUsdCentsCompact,
} from "@shared/pollen-packs.ts";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { responseError } from "../../lib/response-error.ts";
import { PaymentTrustFooter } from "./payment-trust-footer.tsx";
import { PollenPackSlider } from "./pollen-pack-controls.tsx";

type GiftPollenPanelProps = {
    success?: boolean;
    canceled?: boolean;
    sessionId?: string;
    onBuyForSelf?: () => void;
    autoTopUpPanel?: ReactNode;
    redeemCard?: ReactNode;
};

export function GiftPollenPanel({
    success = false,
    canceled = false,
    sessionId,
    onBuyForSelf,
    autoTopUpPanel,
    redeemCard,
}: GiftPollenPanelProps) {
    const [selectedAmount, setSelectedAmount] = useState(
        POLLEN_GIFT_DEFAULT_AMOUNT,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [purchasedCode, setPurchasedCode] = useState<string | null>(null);
    const selectedPack =
        POLLEN_GIFT_PACKS.find((pack) => pack.amountUsd === selectedAmount) ??
        POLLEN_GIFT_PACKS[0];
    const serviceFeeCents = selectedPack
        ? calculateServiceFeeCents(selectedPack.amountUsd * 100)
        : 0;
    const subtotalBeforeTaxCents =
        (selectedPack?.amountUsd ?? 0) * 100 + serviceFeeCents;
    const chargeLabel = formatUsdCentsCompact(subtotalBeforeTaxCents);

    useEffect(() => {
        if (!success || !sessionId) return;
        const receiptSessionId = sessionId;
        let disposed = false;

        async function loadReceipt(): Promise<void> {
            const response = await apiClient["pollen-gifts"].receipt[
                ":sessionId"
            ]
                .$get({ param: { sessionId: receiptSessionId } })
                .catch(() => null);
            if (!response) return;

            const payload = (await response
                .json()
                .catch(() => null)) as unknown;
            if (
                !disposed &&
                response.ok &&
                payload &&
                typeof payload === "object" &&
                "code" in payload &&
                typeof payload.code === "string"
            ) {
                setPurchasedCode(payload.code);
                const url = new URL(window.location.href);
                url.searchParams.delete("session_id");
                window.history.replaceState(window.history.state, "", url);
            }
        }

        void loadReceipt();
        return () => {
            disposed = true;
        };
    }, [sessionId, success]);

    function selectAmount(amount: number): void {
        setSelectedAmount(amount);
        setError(null);
    }

    async function startCheckout(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedPack || isSubmitting) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const response = await apiClient["pollen-gifts"].checkout.$post({
                json: { amount: selectedPack.amountUsd },
            });
            const payload = (await response
                .json()
                .catch(() => null)) as unknown;

            if (!response.ok) {
                setError(
                    responseError(
                        payload,
                        "We couldn't start checkout. Please try again.",
                    ),
                );
                return;
            }

            if (
                !payload ||
                typeof payload !== "object" ||
                !("url" in payload) ||
                typeof payload.url !== "string"
            ) {
                setError("Checkout did not return a payment link.");
                return;
            }

            window.location.assign(payload.url);
        } catch {
            setError("We couldn't start checkout. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {success && (
                <Alert title="Gift purchased">
                    {purchasedCode ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <code className="break-all font-mono font-semibold">
                                {purchasedCode}
                            </code>
                            <CopyButton
                                value={purchasedCode}
                                tooltip={null}
                                onCopyError={() =>
                                    setError(
                                        "We couldn't copy the code. Please copy it manually.",
                                    )
                                }
                                className="inline-flex items-center justify-center rounded-full bg-theme-bg-active px-2 pt-0.5 pb-1 text-sm font-medium text-theme-text-strong transition-colors hover:bg-theme-bg-hover"
                            >
                                {(copied) => (copied ? "Copied" : "Copy code")}
                            </CopyButton>
                        </div>
                    ) : (
                        "Stripe will email your gift code after payment is confirmed."
                    )}
                </Alert>
            )}
            {canceled && (
                <Alert intent="warning" title="Checkout canceled">
                    Nothing was charged. You can try again at any time.
                </Alert>
            )}

            <form onSubmit={startCheckout}>
                <Surface>
                    {selectedPack && (
                        <div className="flex w-full flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-4 sm:pb-20">
                            <div className="w-full min-w-0 flex-1 pb-20 sm:pb-0">
                                <PollenPackSlider
                                    value={selectedPack.amountUsd}
                                    onChange={selectAmount}
                                    packs={POLLEN_GIFT_PACKS}
                                    label="Select gift amount"
                                    selectedBadgeLabel={chargeLabel}
                                    selectedBadgeDetail={`incl. ${formatUsdCentsCompact(serviceFeeCents)} fee`}
                                    disabled={isSubmitting}
                                />
                            </div>
                            <div
                                data-theme="accent"
                                className="relative flex w-36 flex-col items-center self-start sm:shrink-0 sm:self-center"
                            >
                                <Tooltip
                                    triggerAs="span"
                                    content={
                                        <span className="block">
                                            Buy a code for{" "}
                                            <span className="font-semibold text-theme-text-strong">
                                                {selectedPack.amountUsd} Pollen
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
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-36 min-w-0 gap-1.5 text-center shadow-none"
                                    >
                                        <WalletIcon className="h-4 w-4 shrink-0" />
                                        {isSubmitting
                                            ? "Opening..."
                                            : "Buy gift"}
                                    </Button>
                                </Tooltip>
                                {onBuyForSelf && (
                                    <button
                                        type="button"
                                        onClick={onBuyForSelf}
                                        className="absolute top-full left-1/2 mt-2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-theme-text-muted underline decoration-theme-text-muted/40 underline-offset-2 transition-colors hover:text-theme-text-strong"
                                    >
                                        Buy for myself
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </Surface>
            </form>

            {autoTopUpPanel}
            {redeemCard}

            {error && <Alert intent="danger">{error}</Alert>}

            <PaymentTrustFooter className="mt-1">
                <p className="flex items-start gap-1.5">
                    <GiftIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Redeemed gift codes are non-refundable.{" "}
                        <InlineLink
                            href="https://pollinations.ai/terms"
                            showIcon={false}
                        >
                            Terms
                        </InlineLink>{" "}
                        ·{" "}
                        <InlineLink
                            href="https://pollinations.ai/refunds"
                            showIcon={false}
                        >
                            Refund
                        </InlineLink>
                    </span>
                </p>
            </PaymentTrustFooter>
        </div>
    );
}

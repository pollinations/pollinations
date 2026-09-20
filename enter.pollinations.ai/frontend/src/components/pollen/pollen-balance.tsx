import {
    CardIcon,
    CopyButton,
    GlobeIcon,
    InfoTip,
    InlineLink,
    MailIcon,
    SproutIcon,
    Surface,
    WalletIcon,
} from "@pollinations/ui";
import { formatPollen, WalletBalanceCard } from "@pollinations/ui/wallet";
import { Link } from "@tanstack/react-router";
import type { FC, ReactNode } from "react";
import { AutoTopUpPanel, type BillingState } from "./auto-top-up-panel.tsx";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";
import { PollenPackPurchase } from "./pollen-pack-purchase.tsx";

type PollenBalanceProps = {
    tierBalance: number;
    packBalance: number;
    paidWeek?: number;
    tierWeek?: number;
    /** Only the two balance cards: no total row, no "how it works" footer. */
    compact?: boolean;
};

const BALANCE_DISPLAY_EPSILON = 0.0001;
const TERMS_URL = "https://pollinations.ai/terms";
const REFUND_POLICY_URL = "https://pollinations.ai/refunds";

function normalizeDisplayBalance(value: number): number {
    return Math.abs(value) < BALANCE_DISPLAY_EPSILON ? 0 : value;
}

const TooltipList: FC<{
    title: string;
    icon: ReactNode;
    items: string[];
    earned?: number;
}> = ({ title, icon, items, earned }) => (
    <span className="block leading-snug">
        <span className="flex items-center gap-1 font-semibold text-ink-900">
            {title}
            {icon}
        </span>
        <ul className="mt-1.5 space-y-1 text-ink-700">
            {items.map((item) => (
                <li key={item} className="flex gap-1.5">
                    <span aria-hidden="true">•</span>
                    <span>{item}</span>
                </li>
            ))}
        </ul>
        {earned !== undefined && earned > 0 && (
            <span className="mt-2 block border-t border-divider pt-1.5 text-intent-success-text font-semibold">
                +{formatPollen(earned)}{" "}
                <span className="font-medium text-theme-text-muted">
                    earned past 7d
                </span>
            </span>
        )}
    </span>
);

export const PollenBalance: FC<PollenBalanceProps> = ({
    tierBalance,
    packBalance,
    paidWeek = 0,
    tierWeek = 0,
    compact = false,
}) => {
    const displayTierBalance = normalizeDisplayBalance(tierBalance);
    const displayPaidBalance = normalizeDisplayBalance(packBalance);
    const totalPollen = normalizeDisplayBalance(
        displayTierBalance + displayPaidBalance,
    );
    const totalWeek = normalizeDisplayBalance(paidWeek + tierWeek);

    return (
        <div className="flex flex-col gap-3">
            {/* Twin headline numbers: Paid + Quest as tinted cards */}
            <div className="grid grid-cols-2 gap-3">
                <WalletBalanceCard
                    kind="paid"
                    label="Paid"
                    value={formatPollen(displayPaidBalance)}
                    info={
                        <InfoTip
                            label="About Paid Pollen"
                            text={
                                <TooltipList
                                    title="Paid Pollen"
                                    icon={<CardIcon className="h-4 w-4" />}
                                    items={[
                                        "Pollen you bought",
                                        "Earnings from paid-side spend in your apps",
                                        "Used for paid-only models, or when Quest Pollen can't cover",
                                    ]}
                                    earned={paidWeek}
                                />
                            }
                        />
                    }
                    footer={
                        paidWeek > 0 ? (
                            <>
                                +{formatPollen(paidWeek)}{" "}
                                <span className="font-medium text-theme-text-muted">
                                    / 7d
                                </span>
                            </>
                        ) : undefined
                    }
                />
                <WalletBalanceCard
                    kind="tier"
                    label="Quest"
                    value={formatPollen(displayTierBalance)}
                    info={
                        <InfoTip
                            label="About Quest Pollen"
                            text={
                                <TooltipList
                                    title="Quest Pollen"
                                    icon={<SproutIcon className="h-4 w-4" />}
                                    items={[
                                        "Pollen earned from completing Quests",
                                        "Earnings credited from your apps",
                                        "Used first for regular models, when it can cover",
                                    ]}
                                    earned={tierWeek}
                                />
                            }
                        />
                    }
                    footer={
                        tierWeek > 0 ? (
                            <>
                                +{formatPollen(tierWeek)}{" "}
                                <span className="font-medium text-theme-text-muted">
                                    / 7d
                                </span>
                            </>
                        ) : undefined
                    }
                />
            </div>

            {!compact && (
                <>
                    {/* Total + 7d earnings below */}
                    <Surface className="flex items-start justify-between gap-3">
                        <span className="text-sm font-bold uppercase tracking-wide text-theme-text-soft pt-1">
                            Total
                        </span>
                        <div className="flex flex-col items-end leading-tight">
                            <span className="flex items-baseline gap-1.5">
                                <span className="text-2xl sm:text-3xl font-bold tabular-nums leading-none tracking-tight text-theme-text-soft">
                                    {formatPollen(totalPollen)}
                                </span>
                                <span className="text-xs font-bold text-theme-text-soft">
                                    pollen
                                </span>
                            </span>
                            {totalWeek > 0 && (
                                <span className="mt-1 text-sm font-bold tabular-nums text-intent-success-text">
                                    +{formatPollen(totalWeek)}{" "}
                                    <span className="font-medium text-theme-text-muted">
                                        / 7d
                                    </span>
                                </span>
                            )}
                        </div>
                    </Surface>

                    {/* Footer: learn more */}
                    <div className="mt-2 space-y-2 text-[13px] leading-snug text-theme-text-muted">
                        <p className="flex items-start gap-1.5">
                            <WalletIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                Your wallet holds Pollen you've purchased plus
                                Pollen you've earned.{" "}
                                <InlineLink
                                    as={Link}
                                    to="/news"
                                    hash="how-does-my-pollen-wallet-work"
                                    external={false}
                                >
                                    How it works
                                </InlineLink>
                            </span>
                        </p>
                    </div>
                </>
            )}
        </div>
    );
};

type BuyPollenPanelProps = {
    initialBillingState: BillingState | null;
    selectedPackAmount: number;
    onSelectedPackAmountChange: (amount: number) => void;
    /** Standalone /top-up: Stripe returns there, carrying the app link. */
    returnToTopUp?: { redirect?: string };
};

export const BuyPollenPanel: FC<BuyPollenPanelProps> = ({
    initialBillingState,
    selectedPackAmount,
    onSelectedPackAmountChange,
    returnToTopUp,
}) => {
    return (
        <>
            <PollenPackPurchase
                selectedPackAmount={selectedPackAmount}
                onSelectedPackAmountChange={onSelectedPackAmountChange}
                returnToTopUp={returnToTopUp}
            />
            <Surface>
                <AutoTopUpPanel
                    initialBillingState={initialBillingState}
                    returnToTopUp={returnToTopUp}
                />
            </Surface>
            <div className="mt-4 space-y-2 text-[13px] leading-snug text-theme-text-muted">
                <PaymentTrustBadge className="mt-0 pt-0" />
                <p className="flex items-start gap-1.5">
                    <GlobeIcon
                        aria-hidden="true"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    />
                    <span>
                        Taxes added at checkout.{" "}
                        <InlineLink href={TERMS_URL}>Terms</InlineLink>
                        {" · "}
                        <InlineLink href={REFUND_POLICY_URL}>
                            Refund Policy
                        </InlineLink>
                    </span>
                </p>
                <p className="flex items-start gap-1.5">
                    <MailIcon
                        aria-hidden="true"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    />
                    <span>
                        Payment help:{" "}
                        <CopyButton
                            value="billing@pollinations.ai"
                            className="underline decoration-theme-text-soft/30 underline-offset-2 transition-colors hover:text-theme-text-soft"
                        >
                            {(copied) =>
                                copied ? "Copied!" : "billing@pollinations.ai"
                            }
                        </CopyButton>
                    </span>
                </p>
            </div>
        </>
    );
};

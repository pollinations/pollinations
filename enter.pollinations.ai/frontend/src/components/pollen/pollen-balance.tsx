import {
    CardIcon,
    ClockIcon,
    CopyButton,
    ExternalLinkButton,
    InfoTip,
    InlineLink,
    MailIcon,
    SproutIcon,
    Surface,
    Tooltip,
    WalletIcon,
} from "@pollinations/ui";
import {
    formatPollen,
    WalletBalanceCard,
    WalletKindIcon,
} from "@pollinations/ui/wallet";
import {
    calculateServiceFeeCents,
    formatUsdCents,
    formatUsdCentsCompact,
    POLLEN_PACKS,
} from "@shared/pollen-packs.ts";
import { type FC, type ReactNode, useState } from "react";
import { AutoTopUpPanel, type BillingState } from "./auto-top-up-panel.tsx";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";
import { PollenPackSlider } from "./pollen-pack-controls.tsx";

type PollenBalanceProps = {
    tierBalance: number;
    packBalance: number;
    tier?: string;
    paidWeek?: number;
    tierWeek?: number;
};

const BALANCE_DISPLAY_EPSILON = 0.0001;
const REFUND_POLICY_URL = "https://pollinations.ai/refunds";

function normalizeDisplayBalance(value: number): number {
    return Math.abs(value) < BALANCE_DISPLAY_EPSILON ? 0 : value;
}

// Filled warning triangle — local since @pollinations/ui doesn't ship one yet.
const AlertTriangleIcon: FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
    >
        <path d="M7.13 1.71a1 1 0 0 1 1.74 0l6.49 11.32a1 1 0 0 1-.87 1.5H1.51a1 1 0 0 1-.87-1.5L7.13 1.71ZM8 5.5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 5.5Zm0 7a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z" />
    </svg>
);

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
    tier = "spore",
    paidWeek = 0,
    tierWeek = 0,
}) => {
    const displayTierBalance = normalizeDisplayBalance(tierBalance);
    const displayPaidBalance = normalizeDisplayBalance(packBalance);
    const totalPollen = normalizeDisplayBalance(
        displayTierBalance + displayPaidBalance,
    );
    const totalWeek = normalizeDisplayBalance(paidWeek + tierWeek);
    const hideTierColumn = tier === "microbe" && displayTierBalance === 0;

    return (
        <div className="flex flex-col gap-3">
            {/* Twin headline numbers: Paid + Quest as tinted cards */}
            <div
                className={
                    hideTierColumn
                        ? "grid grid-cols-1 gap-3"
                        : "grid grid-cols-2 gap-3"
                }
            >
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
                {!hideTierColumn && (
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
                                        icon={
                                            <SproutIcon className="h-4 w-4" />
                                        }
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
                )}
            </div>

            {/* Total + 7d earnings below */}
            <div className="flex items-start justify-between gap-3 pt-3">
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
            </div>

            {/* Footer: learn more + tier-retirement notice */}
            <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                <p className="flex items-start gap-1.5">
                    <WalletIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Your wallet holds Pollen you've purchased plus Pollen
                        you've earned.{" "}
                        <InlineLink
                            as="button"
                            type="button"
                            external={false}
                            onClick={() => {
                                const slug = "how-does-my-pollen-wallet-work";
                                if (window.location.hash === `#${slug}`) {
                                    window.dispatchEvent(
                                        new HashChangeEvent("hashchange"),
                                    );
                                } else {
                                    window.location.hash = slug;
                                }
                            }}
                        >
                            How it works
                        </InlineLink>
                    </span>
                </p>
                <p className="flex items-start gap-1.5">
                    <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-intent-danger-text" />
                    <span>
                        Tiers are going away. Pollen rewards now come from
                        Quests — your balances and access are unchanged.
                    </span>
                </p>
            </div>
        </div>
    );
};

type SidebarWalletProps = {
    tierBalance: number;
    packBalance: number;
    tier?: string;
    paidWeek?: number;
    tierWeek?: number;
    onClick?: () => void;
};

export const SidebarWallet: FC<SidebarWalletProps> = ({
    tierBalance,
    packBalance,
    tier = "spore",
    paidWeek = 0,
    tierWeek = 0,
}) => {
    const displayTierBalance = normalizeDisplayBalance(tierBalance);
    const displayPaidBalance = normalizeDisplayBalance(packBalance);
    const hideTierSegment = tier === "microbe" && displayTierBalance === 0;

    return (
        <div data-theme="accent" className="px-3 py-1 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-theme-text-soft">
                    <WalletKindIcon kind="paid" />
                    Paid
                </span>
                <span className="flex items-baseline gap-1.5">
                    <span className="text-sm font-bold tabular-nums text-theme-text-soft leading-none">
                        {formatPollen(displayPaidBalance)}
                    </span>
                    {paidWeek > 0 && (
                        <span className="text-micro font-bold tabular-nums text-intent-success-text">
                            +{formatPollen(paidWeek)}
                        </span>
                    )}
                </span>
            </div>
            {!hideTierSegment && (
                <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-theme-text-soft">
                        <WalletKindIcon kind="tier" />
                        Quest
                    </span>
                    <span className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold tabular-nums text-theme-text-soft leading-none">
                            {formatPollen(displayTierBalance)}
                        </span>
                        {tierWeek > 0 && (
                            <span className="text-micro font-bold tabular-nums text-intent-success-text">
                                +{formatPollen(tierWeek)}
                            </span>
                        )}
                    </span>
                </div>
            )}
        </div>
    );
};

type BuyPollenPanelProps = {
    initialBillingState: BillingState | null;
};

export const BuyPollenPanel: FC<BuyPollenPanelProps> = ({
    initialBillingState,
}) => {
    const [selectedPackAmount, setSelectedPackAmount] = useState(
        POLLEN_PACKS.find((pack) => pack.amountUsd === 5)?.amountUsd ??
            POLLEN_PACKS[0]?.amountUsd ??
            5,
    );
    const selectedPackIndex = Math.max(
        0,
        POLLEN_PACKS.findIndex((pack) => pack.amountUsd === selectedPackAmount),
    );
    const selectedPack = POLLEN_PACKS[selectedPackIndex] ?? POLLEN_PACKS[0];
    const serviceFeeCents = selectedPack
        ? calculateServiceFeeCents(selectedPack.amountUsd * 100)
        : 0;
    const subtotalBeforeTaxCents =
        (selectedPack?.amountUsd ?? 0) * 100 + serviceFeeCents;
    const chargeLabel = selectedPack
        ? formatUsdCentsCompact(subtotalBeforeTaxCents)
        : "$0";

    return (
        <>
            <Surface>
                {selectedPack && (
                    <div className="flex w-full flex-col items-start gap-4 pb-10 sm:flex-row sm:items-center sm:gap-4 sm:pb-20">
                        <div className="w-full min-w-0 flex-1 pb-20 sm:pb-0">
                            <PollenPackSlider
                                value={selectedPack.amountUsd}
                                onChange={setSelectedPackAmount}
                                selectedBadgeLabel={chargeLabel}
                                selectedBadgeTooltip={
                                    selectedPack ? (
                                        <PurchaseCostTooltip
                                            packAmountUsd={
                                                selectedPack.amountUsd
                                            }
                                            serviceFeeCents={serviceFeeCents}
                                            subtotalBeforeTaxCents={
                                                subtotalBeforeTaxCents
                                            }
                                        />
                                    ) : undefined
                                }
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
                                        Tax calculated at checkout.
                                    </span>
                                </span>
                            }
                            displayContents
                        >
                            <ExternalLinkButton
                                href={`/api/stripe/checkout/${selectedPack.packKey}`}
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
                )}
            </Surface>
            <Surface>
                <AutoTopUpPanel initialBillingState={initialBillingState} />
            </Surface>
            <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                <p className="flex items-start gap-1.5">
                    <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Credits are instant, never expire, and follow our{" "}
                        <InlineLink href={REFUND_POLICY_URL}>
                            Refund Policy
                        </InlineLink>
                        .
                    </span>
                </p>
                <p className="flex items-start gap-1.5">
                    <MailIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Payment issue or missing pollen?{" "}
                        <CopyButton
                            value="billing@pollinations.ai"
                            className="underline decoration-theme-text-soft/30 underline-offset-2 transition-colors hover:text-theme-text-soft"
                        >
                            {(copied) =>
                                copied ? "Copied!" : "billing@pollinations.ai"
                            }
                        </CopyButton>{" "}
                        — we reply same day.
                    </span>
                </p>
                <PaymentTrustBadge className="mt-0 pt-0" />
            </div>
        </>
    );
};

const PurchaseCostTooltip: FC<{
    packAmountUsd: number;
    serviceFeeCents: number;
    subtotalBeforeTaxCents: number;
}> = ({ packAmountUsd, serviceFeeCents, subtotalBeforeTaxCents }) => (
    <span className="block min-w-36 leading-relaxed text-theme-text-muted">
        <span className="flex justify-between gap-3">
            <span>Pack</span>
            <span className="font-bold text-theme-text-soft">
                {formatUsdCents(packAmountUsd * 100)}
            </span>
        </span>
        <span className="flex justify-between gap-3">
            <span>Service fee</span>
            <span className="font-bold text-theme-text-soft">
                {formatUsdCents(serviceFeeCents)}
            </span>
        </span>
        <span className="flex justify-between gap-3 border-t border-divider pt-1">
            <span>Before tax</span>
            <span className="font-bold text-theme-text-soft">
                {formatUsdCents(subtotalBeforeTaxCents)}
            </span>
        </span>
        <span className="block">Tax calculated at checkout</span>
    </span>
);

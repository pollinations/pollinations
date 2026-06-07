import {
    Button,
    ClockIcon,
    CopyButton,
    InfoTip,
    MailIcon,
    Tooltip,
    WalletIcon,
} from "@pollinations/ui";
import {
    formatPollen,
    WalletBalanceCard,
    WalletDot,
} from "@pollinations/ui/wallet";
import { POLLEN_PACKS } from "@shared/pollen-packs.ts";
import { type FC, useState } from "react";
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

const TooltipList: FC<{
    title: string;
    emoji: string;
    items: string[];
    earned?: number;
}> = ({ title, emoji, items, earned }) => (
    <span className="block leading-snug">
        <span className="block font-semibold text-ink-900">
            {title} <span aria-hidden="true">{emoji}</span>
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
            {/* Twin headline numbers: Paid + Tier as tinted cards */}
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
                            label="About paid balance"
                            text={
                                <TooltipList
                                    title="Paid balance"
                                    emoji="💳"
                                    items={[
                                        "Pollen you bought",
                                        "Earnings from paid-side spend in your apps",
                                        "Used for paid-only models, or when Tier can't cover",
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
                        label="Tier"
                        value={formatPollen(displayTierBalance)}
                        info={
                            <InfoTip
                                label="About tier balance"
                                text={
                                    <TooltipList
                                        title="Tier balance"
                                        emoji="🌱"
                                        items={[
                                            "Free Pollen that refills hourly",
                                            "Earnings from tier-side spend in your apps",
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

            {/* Learn more */}
            <div className="mt-5 border-t border-divider pt-5 text-[13px] leading-snug text-theme-text-muted">
                <button
                    type="button"
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
                    className="flex items-start gap-1.5 underline decoration-theme-text-soft/30 underline-offset-2 transition-colors hover:text-theme-text-soft"
                >
                    <WalletIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Learn more</span>
                </button>
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
        <div data-theme="amber" className="px-3 py-1 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-theme-text-soft">
                    <WalletDot kind="paid" />
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
                        <WalletDot kind="tier" />
                        Tier
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

    return (
        <>
            <div className="space-y-4">
                {selectedPack && (
                    <div className="flex w-full flex-col items-start gap-4 pb-10 sm:flex-row sm:items-center sm:gap-4 sm:pb-20">
                        <div className="w-full min-w-0 flex-1 pb-20 sm:pb-0">
                            <PollenPackSlider
                                value={selectedPack.amountUsd}
                                onChange={setSelectedPackAmount}
                            />
                        </div>
                        <Tooltip
                            content={
                                <>
                                    {`Buy ${selectedPack.amountUsd} pollen for $${selectedPack.amountUsd}`}
                                    <br />
                                    confirm on the next page
                                </>
                            }
                            displayContents
                        >
                            <Button
                                as="a"
                                href={`/api/stripe/checkout/${selectedPack.packKey}`}
                                theme="amber"
                                className="w-28 min-w-0 self-start text-center shadow-none sm:shrink-0 sm:self-center"
                            >
                                Buy
                            </Button>
                        </Tooltip>
                    </div>
                )}
            </div>
            <div className="mt-5 border-t border-divider pt-5">
                <AutoTopUpPanel initialBillingState={initialBillingState} />
            </div>
            <div className="mt-5 space-y-2 border-t border-divider pt-5 text-[13px] leading-snug text-theme-text-muted">
                <p className="flex items-start gap-1.5">
                    <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Credits are instant, never expire, and follow our{" "}
                        <a
                            href={REFUND_POLICY_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-theme-text-soft/30 underline-offset-2 transition-colors hover:text-theme-text-soft"
                        >
                            Refund Policy
                        </a>
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

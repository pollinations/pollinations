import {
    CardIcon,
    CheckIcon,
    ClipboardIcon,
    CopyButton,
    cn,
    InfoTip,
    InlineLink,
    MailIcon,
    ReceiptIcon,
    SproutIcon,
    Surface,
    WalletIcon,
} from "@pollinations/ui";
import {
    formatPollen,
    WalletBalanceCard,
    WalletKindIcon,
} from "@pollinations/ui/wallet";
import { SERVICE_FEE_NAME } from "@shared/pollen-packs.ts";
import { Link } from "@tanstack/react-router";
import type { FC, ReactNode } from "react";
import type { BillingOverview } from "../../backend-types.ts";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";
import { TopUpPanel } from "./top-up-panel.tsx";

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
                    <Footnotes className="mt-2">
                        <p className="flex items-start gap-1.5">
                            <WalletIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                What you've purchased plus what you've earned.{" "}
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
                    </Footnotes>
                </>
            )}
        </div>
    );
};

type SidebarWalletProps = {
    tierBalance: number;
    packBalance: number;
    paidWeek?: number;
    tierWeek?: number;
    onClick?: () => void;
};

export const SidebarWallet: FC<SidebarWalletProps> = ({
    tierBalance,
    packBalance,
    paidWeek = 0,
    tierWeek = 0,
}) => {
    const displayTierBalance = normalizeDisplayBalance(tierBalance);
    const displayPaidBalance = normalizeDisplayBalance(packBalance);

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
        </div>
    );
};

type BuyPollenPanelProps = {
    initialBilling: BillingOverview | null;
    /** More footnote lines under the trust line (the standalone page). */
    footnotes?: ReactNode;
    /** Back from Stripe's setup page for automatic top-up. */
    setupReturn?: boolean;
    /** Standalone /top-up: Stripe returns there, carrying the app link. */
    returnToTopUp?: { redirect?: string };
    /** Reload the wallet and billing once a purchase is credited. */
    onCredited?: () => void;
};

export const BuyPollenPanel: FC<BuyPollenPanelProps> = ({
    initialBilling,
    footnotes,
    setupReturn,
    returnToTopUp,
    onCredited,
}) => (
    <>
        <TopUpPanel
            initialBilling={initialBilling}
            setupReturn={setupReturn}
            returnToTopUp={returnToTopUp}
            onCredited={onCredited}
        />
        <Footnotes>
            <p className="flex items-start gap-1.5">
                <ReceiptIcon
                    aria-hidden="true"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span>
                    Prices include the {SERVICE_FEE_NAME.toLowerCase()}, plus
                    tax at payment
                </span>
            </p>
            <PaymentTrustBadge className="mt-0 pt-0" />
            {footnotes}
        </Footnotes>
    </>
);

/**
 * The dashboard's footnote block: 8px between lines, 4px inset. The section's
 * own gap sets the space above it, as on every other page.
 */
export const Footnotes: FC<{ className?: string; children: ReactNode }> = ({
    className,
    children,
}) => (
    <div
        className={cn(
            "space-y-2 px-1 text-[13px] leading-snug text-theme-text-muted",
            className,
        )}
    >
        {children}
    </div>
);

/**
 * Who to ask and the terms of buying: in Billing on the Pollen page, under
 * the Top-up card on the standalone top-up page.
 */
export const PaymentHelp: FC = () => (
    <p className="flex items-start gap-1.5">
        <MailIcon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
            Payment help:{" "}
            {/* Styled like Terms and Refund; a copy icon where theirs has
                the arrow. The icon says copy and the text says email
                copied, so no tooltip. */}
            <CopyButton
                value="billing@pollinations.ai"
                className="polli-link"
                data-tone="accent"
                tooltip={null}
            >
                {(copied) => (
                    <>
                        {copied ? "email copied" : "billing@pollinations.ai"}
                        {copied ? (
                            <CheckIcon
                                aria-hidden="true"
                                className="polli-link-external-icon"
                            />
                        ) : (
                            <ClipboardIcon
                                aria-hidden="true"
                                className="polli-link-external-icon"
                            />
                        )}
                    </>
                )}
            </CopyButton>
            <LinkSeparator />
            <InlineLink href={TERMS_URL}>Terms</InlineLink>
            <LinkSeparator />
            <InlineLink href={REFUND_POLICY_URL}>Refund</InlineLink>
        </span>
    </p>
);

/** A dot between links, with room around it. */
const LinkSeparator: FC = () => (
    <span aria-hidden="true" className="mx-2 text-theme-text-muted">
        ·
    </span>
);

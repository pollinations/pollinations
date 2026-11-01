import {
    CardIcon,
    Chip,
    CopyButton,
    CopyStateIcon,
    cn,
    InfoTip,
    InlineLink,
    LockIcon,
    MailIcon,
    ReceiptIcon,
    RefreshIcon,
    ShieldCheckIcon,
    SproutIcon,
    Surface,
    useOnline,
    WalletIcon,
    WarningIcon,
} from "@pollinations/ui";
import {
    formatPollen,
    WalletBalanceCard,
    WalletKindIcon,
} from "@pollinations/ui/wallet";
import { AUTO_TOP_UP_THRESHOLD_POLLEN } from "@shared/billing/auto-top-up.ts";
import { type PollenPackKey, SERVICE_FEE_NAME } from "@shared/pollen-packs.ts";
import { Link } from "@tanstack/react-router";
import type { FC, ReactNode } from "react";
import type { BillingOverview } from "../../backend-types.ts";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";
import { TopUpPanel } from "./top-up-panel.tsx";

type PollenBalanceProps = {
    tierBalance: number;
    packBalance: number;
    questPollenRestricted?: boolean;
    paidWeek?: number;
    tierWeek?: number;
    /** Only the two balance cards: no total row, no "how it works" footer. */
    compact?: boolean;
};

const BALANCE_DISPLAY_EPSILON = 0.0001;
export const TERMS_URL = "https://pollinations.ai/terms";
export const REFUND_POLICY_URL = "https://pollinations.ai/refunds";

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
    questPollenRestricted = false,
    paidWeek = 0,
    tierWeek = 0,
    compact = false,
}) => {
    const displayTierBalance = normalizeDisplayBalance(tierBalance);
    const displayPaidBalance = normalizeDisplayBalance(packBalance);
    const totalPollen = normalizeDisplayBalance(
        (questPollenRestricted ? 0 : displayTierBalance) + displayPaidBalance,
    );
    const totalWeek = normalizeDisplayBalance(
        paidWeek + (questPollenRestricted ? 0 : tierWeek),
    );

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
                            label="About Paid pollen"
                            text={
                                <TooltipList
                                    title="Paid pollen"
                                    icon={<CardIcon className="h-4 w-4" />}
                                    items={[
                                        "pollen you bought",
                                        "Earnings from paid-side spend in your apps",
                                        "Used for paid-only models, or when Quest pollen can't cover",
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
                    value={
                        <span
                            className={
                                questPollenRestricted
                                    ? "text-theme-text-muted"
                                    : undefined
                            }
                        >
                            {formatPollen(displayTierBalance)}
                        </span>
                    }
                    info={
                        <InfoTip
                            label="About Quest pollen"
                            text={
                                <TooltipList
                                    title="Quest pollen"
                                    icon={<SproutIcon className="h-4 w-4" />}
                                    items={[
                                        "pollen earned from completing Quests",
                                        "Earnings credited from your apps",
                                        questPollenRestricted
                                            ? "Available after your account is verified"
                                            : "Used first for regular models, when it can cover",
                                    ]}
                                    earned={tierWeek}
                                />
                            }
                        />
                    }
                    footer={
                        !questPollenRestricted && tierWeek > 0 ? (
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
                    <Surface className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-sm font-bold uppercase tracking-wide text-theme-text-soft pt-1">
                                {questPollenRestricted ? "Available" : "Total"}
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
                        {questPollenRestricted && (
                            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-theme-text-muted">
                                <LockIcon
                                    aria-hidden="true"
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                />
                                <span>
                                    <span className="font-semibold text-theme-text-strong">
                                        {formatPollen(displayTierBalance)} Quest
                                        pollen locked.
                                    </span>{" "}
                                    Verification needed:{" "}
                                    <InlineLink
                                        href="/pollen#buy-pollen"
                                        tone="quiet"
                                        showIcon={false}
                                    >
                                        make your first purchase
                                    </InlineLink>{" "}
                                    or{" "}
                                    <InlineLink
                                        href="mailto:hello@pollinations.ai"
                                        tone="quiet"
                                        showIcon={false}
                                    >
                                        contact us
                                    </InlineLink>
                                    .
                                </span>
                            </p>
                        )}
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

/**
 * What your listings earned in the last 7 days, paid and Quest together, on
 * the drawer's My Models row: the same chip as Quests' "claimable", only
 * when it is above zero.
 */
export const SidebarEarnings: FC<{ paidWeek: number; tierWeek: number }> = ({
    paidWeek,
    tierWeek,
}) => {
    const earned = normalizeDisplayBalance(paidWeek + tierWeek);
    if (earned <= 0) return null;
    return (
        <Chip
            intent="neutral"
            size="sm"
            title="Earned in the last 7 days"
            className="ml-auto bg-transparent text-theme-text-soft"
        >
            +{formatPollen(earned)} pollen
            <span className="sr-only"> earned in the last 7 days</span>
        </Chip>
    );
};

/**
 * One balance on its drawer row: Credits' paid, Quests' Quest Pollen. A lock
 * marks Quest Pollen that waits on verification.
 */
export const SidebarBalance: FC<{
    kind: "paid" | "tier";
    balance: number;
    restricted?: boolean;
}> = ({ kind, balance, restricted = false }) => (
    <Chip
        intent="neutral"
        size="sm"
        className="ml-auto gap-1 bg-transparent tabular-nums text-theme-text-soft"
    >
        <WalletKindIcon kind={kind} />
        {formatPollen(normalizeDisplayBalance(balance))}
        <span className="sr-only">
            {kind === "paid" ? " paid" : " Quest"} pollen
        </span>
        {restricted && (
            <LockIcon
                aria-hidden={false}
                role="img"
                aria-label="Quest pollen needs verification"
                className="h-3 w-3 shrink-0 text-theme-text-muted"
            />
        )}
    </Chip>
);

/** The drawer wallet while Pollinations is down: two rows, like the balances. */
export const SidebarOutage: FC = () => {
    const online = useOnline();
    return (
        <div
            data-theme="accent"
            className="px-3 py-1 flex flex-col gap-1 text-xs font-bold"
        >
            <span className="flex items-center gap-1.5 text-intent-warning-text">
                <WarningIcon
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                />
                {online ? "Temporary outage" : "You’re offline"}
            </span>
            <span className="flex items-center gap-1.5 text-theme-text-soft">
                <ShieldCheckIcon
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                />
                Your pollen is safe
            </span>
        </div>
    );
};

type BuyPollenPanelProps = {
    initialBilling: BillingOverview | null;
    /** Standalone /top-up: Stripe returns there, carrying the app link. */
    returnToTopUp?: { redirect?: string };
    /** Reload the wallet and billing after Top-up changed them. */
    onWalletChange?: () => void;
    initialPack?: PollenPackKey;
};

export const BuyPollenPanel: FC<BuyPollenPanelProps> = ({
    initialBilling,
    returnToTopUp,
    onWalletChange,
    initialPack,
}) => (
    <>
        <TopUpPanel
            initialBilling={initialBilling}
            returnToTopUp={returnToTopUp}
            onWalletChange={onWalletChange}
            initialPack={initialPack}
        />
        <Footnotes>
            {/* When auto top-up charges, stated before anyone turns it on.
                "Paid": Quest Pollen doesn't trigger it. */}
            <p className="flex items-start gap-1.5">
                <RefreshIcon
                    aria-hidden="true"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span>
                    Auto top-up buys its pack when your paid balance reaches{" "}
                    {AUTO_TOP_UP_THRESHOLD_POLLEN} pollen
                </span>
            </p>
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
            <PaymentTrustBadge
                className="mt-0 pt-0"
                country={initialBilling?.ipCountry}
            />
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
 * Who to ask and the terms of buying, in Billing on the Pollen page. The
 * standalone top-up page says it in its footer instead.
 */
export const PaymentHelp: FC = () => (
    <p className="flex items-start gap-1.5">
        <MailIcon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
            Payment help:{" "}
            {/* Styled like Terms and Refund; a copy icon where theirs has
                the arrow. The icon says copy and the text says Copied,
                so no tooltip. */}
            <CopyButton
                value="billing@pollinations.ai"
                className="polli-link"
                data-tone="accent"
                tooltip={null}
            >
                {(copied) => (
                    <>
                        {copied ? "Copied" : "billing@pollinations.ai"}
                        <CopyStateIcon
                            copied={copied}
                            aria-hidden="true"
                            className="polli-link-external-icon"
                        />
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

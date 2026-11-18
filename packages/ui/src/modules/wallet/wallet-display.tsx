import type { FC, ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import { CardIcon, SproutIcon } from "../../primitives/icons/index.tsx";
import { Tooltip } from "../../primitives/Tooltip.tsx";

type WalletBalanceKind = "paid" | "tier";

const walletPanelClasses: Record<WalletBalanceKind, string> = {
    paid: "polli-wallet-panel-paid",
    tier: "polli-wallet-panel-tier",
};

const walletTextClasses: Record<WalletBalanceKind, string> = {
    paid: "polli-wallet-text-paid",
    tier: "polli-wallet-text-tier",
};

const walletKindIcons: Record<WalletBalanceKind, typeof CardIcon> = {
    paid: CardIcon,
    tier: SproutIcon,
};

export type WalletKindIconProps = {
    kind: WalletBalanceKind;
    className?: string;
};

/** The paid/Quest marker: a card for paid balance or sprout for Quest Pollen. */
export const WalletKindIcon: FC<WalletKindIconProps> = ({
    kind,
    className,
}) => {
    const Icon = walletKindIcons[kind];
    return (
        <Icon
            aria-hidden="true"
            className={cn(
                "polli:h-3.5 polli:w-3.5 polli:shrink-0",
                walletTextClasses[kind],
                className,
            )}
        />
    );
};

// Same wording as the balance tooltips on the Credits page.
const walletKindHints: Record<WalletBalanceKind, string> = {
    paid: "Paid balance: top-ups you bought. Used for paid-only models, or when Quest balance can't cover.",
    tier: "Quest balance: earned from quests and your apps. Used first for regular models.",
};

export type WalletAmountProps = {
    kind: WalletBalanceKind;
    /** The formatted amount, e.g. "$5". */
    children: ReactNode;
    /** Grey, for amounts already claimed. */
    muted?: boolean;
    /** Inside a button the hint opens on hover only, so a tap still
     *  presses the button. */
    inButton?: boolean;
    className?: string;
};

/** An amount led by its balance's icon: "🌱 $5" or "💳 $5". Both balances
 *  are dollars, so the icon tells them apart; hovering or tapping it explains
 *  the balance, like the Models page chips. */
export const WalletAmount: FC<WalletAmountProps> = ({
    kind,
    children,
    muted = false,
    inButton = false,
    className,
}) => {
    const Icon = walletKindIcons[kind];
    return (
        <span
            className={cn(
                "polli:inline-flex polli:items-center polli:gap-1 polli:tabular-nums",
                // The balance colour marks it as that balance's money; a
                // button keeps its own label colour.
                !muted && !inButton && walletTextClasses[kind],
                className,
            )}
        >
            <Tooltip
                triggerAs="span"
                content={walletKindHints[kind]}
                ariaLabel={walletKindHints[kind]}
                tapEnabled={!inButton}
                stopClickPropagation={!inButton}
                className={cn(
                    "polli:inline-flex polli:items-center",
                    muted
                        ? "polli:text-theme-text-muted"
                        : walletTextClasses[kind],
                )}
            >
                <Icon
                    aria-hidden="true"
                    className="polli:h-4 polli:w-4 polli:shrink-0"
                />
            </Tooltip>
            {children}
        </span>
    );
};

export type WalletBalanceCardProps = {
    tone?: "balance" | "neutral";
    kind: WalletBalanceKind;
    label: ReactNode;
    value: ReactNode;
    icon?: ReactNode;
    info?: ReactNode;
    footer?: ReactNode;
    className?: string;
};

export const WalletBalanceCard: FC<WalletBalanceCardProps> = ({
    tone = "balance",
    kind,
    label,
    value,
    icon,
    info,
    footer,
    className,
}) => {
    const Icon = walletKindIcons[kind];
    const textColor =
        tone === "neutral"
            ? "polli:text-theme-text-strong"
            : walletTextClasses[kind];
    return (
        <div
            className={cn(
                "polli:min-w-0 polli:rounded-card polli:p-3.5 polli:sm:p-5",
                tone === "neutral"
                    ? "polli:bg-surface-opaque"
                    : walletPanelClasses[kind],
                className,
            )}
        >
            <span className="polli:flex polli:items-center polli:gap-2">
                {icon ?? (
                    <Icon
                        aria-hidden="true"
                        className={cn(
                            "polli:h-3.5 polli:w-3.5 polli:shrink-0",
                            textColor,
                        )}
                    />
                )}
                <span
                    className={cn(
                        "polli:text-sm polli:font-bold polli:uppercase polli:tracking-wide",
                        textColor,
                    )}
                >
                    {label}
                </span>
                {info}
            </span>
            <div
                className={cn(
                    "polli-wallet-balance-value polli:[overflow-wrap:anywhere] polli:mt-1 polli:font-bold polli:leading-none polli:tracking-tight polli:tabular-nums",
                    textColor,
                )}
            >
                {value}
            </div>
            {footer && (
                <div className="polli:mt-1.5 polli:text-sm polli:font-bold polli:tabular-nums polli:text-intent-success-text">
                    {footer}
                </div>
            )}
        </div>
    );
};

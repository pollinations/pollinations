import type { FC, ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import { CardIcon, SproutIcon } from "../../primitives/icons/index.tsx";

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
                "polli:min-w-0 polli:rounded-xl polli:p-4",
                tone === "neutral"
                    ? "polli:bg-surface-opaque polli:shadow-well"
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

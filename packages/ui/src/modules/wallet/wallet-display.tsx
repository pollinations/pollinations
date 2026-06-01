import type { FC, ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

type WalletBalanceKind = "paid" | "tier";

const walletPanelClasses: Record<WalletBalanceKind, string> = {
    paid: "polli-wallet-panel-paid",
    tier: "polli-wallet-panel-tier",
};

const walletTextClasses: Record<WalletBalanceKind, string> = {
    paid: "polli-wallet-text-paid",
    tier: "polli-wallet-text-tier",
};

export type WalletDotProps = {
    kind: WalletBalanceKind;
    className?: string;
};

export const WalletDot: FC<WalletDotProps> = ({ kind, className }) => (
    <span
        className={cn(
            "polli:h-2 polli:w-2 polli:rounded-full",
            kind === "paid" ? "polli-wallet-dot-paid" : "polli-wallet-dot-tier",
            className,
        )}
        aria-hidden="true"
    />
);

export type WalletBalanceCardProps = {
    kind: WalletBalanceKind;
    label: ReactNode;
    value: ReactNode;
    info?: ReactNode;
    footer?: ReactNode;
    className?: string;
};

export const WalletBalanceCard: FC<WalletBalanceCardProps> = ({
    kind,
    label,
    value,
    info,
    footer,
    className,
}) => (
    <div
        className={cn(
            "polli:rounded-xl polli:p-4",
            walletPanelClasses[kind],
            className,
        )}
    >
        <span className="polli:flex polli:items-center polli:gap-2">
            <WalletDot kind={kind} />
            <span className="polli:text-sm polli:font-bold polli:uppercase polli:tracking-wide polli:text-amber-900">
                {label}
            </span>
            {info}
        </span>
        <div
            className={cn(
                "polli-wallet-balance-value polli:mt-1 polli:font-bold polli:leading-none polli:tracking-tight polli:tabular-nums",
                walletTextClasses[kind],
            )}
        >
            {value}
        </div>
        {footer && (
            <div className="polli:mt-1.5 polli:text-sm polli:font-bold polli:tabular-nums polli:text-green-700">
                {footer}
            </div>
        )}
    </div>
);

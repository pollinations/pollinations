import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Text } from "../primitives/Typography.tsx";

/**
 * - `stat` — large numeric value (default)
 * - `fact` — small wrapping prose value (labeled fact tile)
 */
type StatCardVariant = "stat" | "fact";

const valueVariantClasses: Record<StatCardVariant, string> = {
    stat: "polli:min-h-8 polli:text-2xl polli:font-bold polli:leading-tight polli:tabular-nums polli:text-theme-text-base",
    fact: "polli:text-sm polli:leading-6 polli:text-theme-text-soft",
};

export type StatCardProps = {
    label: ReactNode;
    value: ReactNode;
    detail?: ReactNode;
    variant?: StatCardVariant;
    className?: string;
    labelClassName?: string;
    valueClassName?: string;
    detailClassName?: string;
};

export const StatCard: FC<StatCardProps> = ({
    label,
    value,
    detail,
    variant = "stat",
    className,
    labelClassName,
    valueClassName,
    detailClassName,
}) => (
    <div className={cn("polli:text-sm", className)}>
        <Text
            as="div"
            size="micro"
            tone="soft"
            weight="bold"
            className={cn(
                "polli:uppercase polli:tracking-wide",
                labelClassName,
            )}
        >
            {label}
        </Text>
        <div
            className={cn(
                "polli:mt-1 polli:break-words",
                valueVariantClasses[variant],
                valueClassName,
            )}
        >
            {value}
        </div>
        {detail && (
            <Text
                as="div"
                size="xs"
                tone="soft"
                className={cn("polli:mt-2", detailClassName)}
            >
                {detail}
            </Text>
        )}
    </div>
);

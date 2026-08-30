import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type StatListItem = {
    value: ReactNode;
    label: ReactNode;
};

export type StatListProps = {
    stats: StatListItem[];
    placeholders?: number;
    className?: string;
};

/** Compact responsive metrics with stable loading placeholders. */
export function StatList({
    stats,
    placeholders = 3,
    className,
}: StatListProps) {
    const loading = stats.length === 0;
    const slots = loading
        ? Array.from({ length: placeholders }, (_, index) => ({
              value: null,
              label: null,
              key: `slot-${index}`,
          }))
        : stats.map((stat, index) => ({ ...stat, key: `stat-${index}` }));

    return (
        <dl
            className={cn(
                "polli:mt-2 polli:flex polli:flex-wrap polli:gap-6 polli:sm:gap-10",
                className,
            )}
            aria-busy={loading}
        >
            {slots.map((slot) => (
                <div
                    key={slot.key}
                    className="polli:flex polli:flex-col polli:gap-1"
                >
                    <dt className="polli:font-heading polli:text-3xl polli:text-theme-text-soft polli:tabular-nums polli:sm:text-4xl">
                        {slot.value ?? (
                            <span
                                aria-hidden="true"
                                className="polli:block polli:h-9 polli:w-24 polli:animate-pulse polli:rounded-md polli:bg-theme-bg-subtle"
                            />
                        )}
                    </dt>
                    <dd className="polli:text-xs polli:text-theme-text-muted">
                        {slot.label ?? (
                            <span
                                aria-hidden="true"
                                className="polli:block polli:h-3 polli:w-20 polli:animate-pulse polli:rounded polli:bg-theme-bg-subtle"
                            />
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

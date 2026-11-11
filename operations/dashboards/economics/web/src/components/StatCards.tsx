import { StatCard, Surface } from "@pollinations/ui";
import type { ReactNode } from "react";

// A stat's headline color. Outcome colors are package-owned: blue is positive,
// red is negative. Status warnings keep their explicit warning treatment.
export type StatTone = "base" | "pos" | "neg" | "warn" | "success";

export type StatItem = {
    label: ReactNode;
    value: ReactNode;
    detail?: ReactNode;
    tone?: StatTone;
};

const TONE_CLASS: Record<StatTone, string> = {
    base: "",
    pos: "text-outcome-positive-text",
    neg: "text-outcome-negative-text",
    warn: "text-intent-warning-text",
    success: "text-intent-success-text",
};

// The Insights header row: the same Surface + StatCard pattern the account
// Activity page uses, driven by data so every tab reads the same. Auto-fits
// 3-6 cards per row and wraps cleanly on narrow screens.
export function StatCards({ items }: { items: StatItem[] }) {
    if (items.length === 0) return null;
    return (
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
            {items.map((item, index) => (
                <Surface
                    key={typeof item.label === "string" ? item.label : index}
                >
                    <StatCard
                        label={item.label}
                        value={item.value}
                        detail={item.detail}
                        valueClassName={TONE_CLASS[item.tone ?? "base"]}
                    />
                </Surface>
            ))}
        </div>
    );
}

export type StatPair = {
    label: string;
    total?: ReactNode;
    detail?: ReactNode;
    items: (StatItem & { valueClassName?: string })[];
};

export function PairedStatCards({
    cards,
    layout = "columns",
    compact = false,
}: {
    cards: StatPair[];
    layout?: "columns" | "rows";
    compact?: boolean;
}) {
    return (
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
            {cards.map((card) => (
                <Surface as="section" key={card.label} aria-label={card.label}>
                    <div
                        className={`${compact ? "mb-2" : "mb-3"} flex min-h-6 flex-wrap content-start items-baseline justify-between gap-x-3 gap-y-1`}
                    >
                        <h3 className="text-sm font-semibold">{card.label}</h3>
                        {card.total && (
                            <span
                                className={`text-xs ${compact ? "text-theme-text-muted" : "text-theme-text-soft"}`}
                            >
                                {card.total}
                            </span>
                        )}
                    </div>
                    {layout === "rows" ? (
                        <div
                            className={`${compact ? "space-y-2" : "space-y-3"} tabular-nums`}
                        >
                            {card.items.map((item, index) => (
                                <div
                                    key={
                                        typeof item.label === "string"
                                            ? item.label
                                            : index
                                    }
                                    className={`grid items-baseline gap-x-3 ${card.items.some((entry) => entry.detail != null) ? "grid-cols-[1fr_auto_3rem]" : "grid-cols-[1fr_auto]"}`}
                                >
                                    <span
                                        className={`text-sm ${compact ? "text-theme-text-muted" : ""}`}
                                    >
                                        {item.label}
                                    </span>
                                    <strong
                                        className={`${compact ? "text-xl" : "text-xl sm:text-2xl"} ${item.valueClassName ?? TONE_CLASS[item.tone ?? "base"]}`}
                                    >
                                        {item.value}
                                    </strong>
                                    {item.detail != null && (
                                        <span
                                            className={`text-right ${compact ? "text-xs text-theme-text-muted" : "text-sm text-theme-text-soft"}`}
                                        >
                                            {item.detail}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 divide-x divide-theme-text-muted/20">
                            {card.items.map((item, index) => (
                                <StatCard
                                    key={
                                        typeof item.label === "string"
                                            ? item.label
                                            : index
                                    }
                                    label={item.label}
                                    value={item.value}
                                    detail={item.detail}
                                    valueClassName={
                                        item.valueClassName ??
                                        TONE_CLASS[item.tone ?? "base"]
                                    }
                                    className="min-w-0 first:pr-3 last:pl-3"
                                    labelClassName="polli:normal-case polli:tracking-normal polli:min-h-10"
                                />
                            ))}
                        </div>
                    )}
                    {card.detail && (
                        <div className="mt-2 text-xs text-theme-text-soft">
                            {card.detail}
                        </div>
                    )}
                </Surface>
            ))}
        </div>
    );
}

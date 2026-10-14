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

import { cn, Surface, Tooltip } from "@pollinations/ui";
import {
    TIER_EMOJIS,
    TIER_POLLEN,
    type TierStatus,
} from "@shared/tier-config.ts";
import type { FC, ReactNode } from "react";

const SeedTooltipContent = () => (
    <div className="w-72">
        <p className="font-semibold text-ink-900 mb-2">Dev Points (need 7+)</p>
        <table className="w-full text-left text-xs">
            <tbody>
                <tr className="border-b border-divider">
                    <td className="py-1 pr-2 text-theme-text-muted leading-tight">
                        Account age
                    </td>
                    <td className="py-1 text-right text-ink-800 whitespace-nowrap">
                        0.5pt/month (max 6)
                    </td>
                </tr>
                <tr className="border-b border-divider">
                    <td className="py-1 pr-2 text-theme-text-muted leading-tight">
                        Public commits (last 90 days)
                    </td>
                    <td className="py-1 text-right text-ink-800 whitespace-nowrap">
                        0.1pt each (max 3)
                    </td>
                </tr>
                <tr className="border-b border-divider">
                    <td className="py-1 pr-2 text-theme-text-muted leading-tight">
                        Original repos (public, non-empty)
                    </td>
                    <td className="py-1 text-right text-ink-800 whitespace-nowrap">
                        0.5pt each (max 1)
                    </td>
                </tr>
                <tr>
                    <td className="py-1 pr-2 text-theme-text-muted leading-tight">
                        Stars (on original non-empty repos)
                    </td>
                    <td className="py-1 text-right text-ink-800 whitespace-nowrap">
                        0.1pt each (max 5)
                    </td>
                </tr>
            </tbody>
        </table>
        <p className="mt-2 pt-2 border-t border-divider text-micro text-theme-text-muted">
            Evaluated weekly. No action needed.
        </p>
    </div>
);

type TierCardProps = {
    isActive: boolean;
    emoji: string;
    name: string;
    pollen: number;
    children: ReactNode;
};

const TierCard: FC<TierCardProps> = ({
    isActive,
    emoji,
    name,
    pollen,
    children,
}) => (
    // Active tier = the wallet's tier colour (tier-pale fill + tier-deep text)
    // so "your current tier" reads at a glance; inactive = neutral well. The
    // fill is an inline style using the exact wallet token, so it can't be lost
    // to a competing themed-bg utility from the Surface variant.
    <Surface
        variant="card"
        style={
            isActive
                ? { backgroundColor: "var(--polli-color-tier-pale)" }
                : undefined
        }
    >
        <span
            className={cn(
                "text-3xl font-bold",
                isActive ? "text-tier-deep" : "text-ink-900",
            )}
        >
            {emoji} {name}
        </span>
        <p
            className={cn(
                "text-xs font-mono mt-1",
                isActive ? "font-bold text-tier-deep" : "text-theme-text-muted",
            )}
        >
            {pollen} pollen/hour
        </p>
        {children}
    </Surface>
);

export const TierExplanation: FC<{ currentTier?: TierStatus }> = ({
    currentTier,
}) => {
    const requirementLabelStyle =
        "text-[9px] font-semibold text-theme-text-muted uppercase tracking-wide";

    return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <TierCard
                isActive={currentTier === "spore"}
                emoji={TIER_EMOJIS.spore}
                name="Spore"
                pollen={TIER_POLLEN.spore}
            >
                <div className="mt-1.5 border-t border-divider pt-1.5">
                    <p className={requirementLabelStyle}>To unlock</p>
                    <p className="text-xs text-theme-text-muted">
                        Verify account
                    </p>
                </div>
            </TierCard>

            <TierCard
                isActive={currentTier === "seed"}
                emoji={TIER_EMOJIS.seed}
                name="Seed"
                pollen={TIER_POLLEN.seed}
            >
                <div className="mt-1.5 border-t border-divider pt-1.5">
                    <p className={requirementLabelStyle}>To unlock</p>
                    <p className="text-xs text-theme-text-muted">
                        <Tooltip content={<SeedTooltipContent />}>
                            <span className="cursor-default underline decoration-dotted">
                                7+ dev points
                            </span>
                        </Tooltip>
                    </p>
                    <p className="text-micro text-intent-success-text mt-0.5">
                        Auto-upgraded weekly
                    </p>
                </div>
            </TierCard>

            <TierCard
                isActive={currentTier === "flower"}
                emoji={TIER_EMOJIS.flower}
                name="Flower"
                pollen={TIER_POLLEN.flower}
            >
                <div className="mt-1.5 border-t border-divider pt-1.5">
                    <p className={requirementLabelStyle}>To unlock</p>
                    <p className="text-xs text-theme-text-muted">
                        <a
                            href="https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml"
                            className="text-theme-text-soft hover:underline"
                        >
                            Publish an app
                        </a>
                    </p>
                    <p className="text-micro text-intent-warning-text mt-0.5">
                        {TIER_EMOJIS.seed} Must be Seed first
                    </p>
                </div>
            </TierCard>
        </div>
    );
};

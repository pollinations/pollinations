import {
    TIER_EMOJIS,
    TIER_POLLEN,
    type TierStatus,
} from "@shared/tier-config.ts";
import type { FC, ReactNode } from "react";
import { Tooltip } from "../pricing/Tooltip.tsx";
import { Chip } from "../ui/chip.tsx";
import { Surface } from "../ui/surface.tsx";

const SeedTooltipContent = () => (
    <div className="w-72">
        <p className="font-semibold text-gray-900 mb-2">Dev Points (need 7+)</p>
        <table className="w-full text-left text-2xs">
            <tbody>
                <tr className="border-b border-gray-100">
                    <td className="py-1 pr-2 text-gray-600 leading-tight">
                        Account age
                    </td>
                    <td className="py-1 text-right text-gray-800 whitespace-nowrap">
                        0.5pt/month (max 6)
                    </td>
                </tr>
                <tr className="border-b border-gray-100">
                    <td className="py-1 pr-2 text-gray-600 leading-tight">
                        Public commits (last 90 days)
                    </td>
                    <td className="py-1 text-right text-gray-800 whitespace-nowrap">
                        0.1pt each (max 3)
                    </td>
                </tr>
                <tr className="border-b border-gray-100">
                    <td className="py-1 pr-2 text-gray-600 leading-tight">
                        Original repos (public, non-empty)
                    </td>
                    <td className="py-1 text-right text-gray-800 whitespace-nowrap">
                        0.5pt each (max 1)
                    </td>
                </tr>
                <tr>
                    <td className="py-1 pr-2 text-gray-600 leading-tight">
                        Stars (on original non-empty repos)
                    </td>
                    <td className="py-1 text-right text-gray-800 whitespace-nowrap">
                        0.1pt each (max 5)
                    </td>
                </tr>
            </tbody>
        </table>
        <p className="mt-2 pt-2 border-t border-gray-100 text-3xs text-gray-500">
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
    <Surface
        variant="card-themed"
        className={isActive ? "bg-tier-pale" : "bg-tier-pale/40"}
    >
        <span className="text-3xl font-bold text-gray-900">
            {emoji} {name}
        </span>
        <Chip
            intent={isActive ? undefined : "tier"}
            size="sm"
            className="font-mono mt-1"
        >
            {pollen} pollen/hour
        </Chip>
        {children}
    </Surface>
);

export const TierExplanation: FC<{ currentTier?: TierStatus }> = ({
    currentTier,
}) => {
    const requirementLabelStyle =
        "text-[9px] font-semibold text-gray-400 uppercase tracking-wide";

    return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <TierCard
                isActive={currentTier === "spore"}
                emoji={TIER_EMOJIS.spore}
                name="Spore"
                pollen={TIER_POLLEN.spore}
            >
                <div className="mt-1.5 border-t border-theme-border-subtle pt-1.5">
                    <p className={requirementLabelStyle}>To unlock</p>
                    <p className="text-xs text-gray-500">Verify account</p>
                </div>
            </TierCard>

            <TierCard
                isActive={currentTier === "seed"}
                emoji={TIER_EMOJIS.seed}
                name="Seed"
                pollen={TIER_POLLEN.seed}
            >
                <div className="mt-1.5 border-t border-theme-border-subtle pt-1.5">
                    <p className={requirementLabelStyle}>To unlock</p>
                    <p className="text-xs text-gray-500">
                        <Tooltip content={<SeedTooltipContent />}>
                            <span className="cursor-default underline decoration-dotted">
                                7+ dev points
                            </span>
                        </Tooltip>
                    </p>
                    <p className="text-3xs text-emerald-600 mt-0.5">
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
                <div className="mt-1.5 border-t border-theme-border-subtle pt-1.5">
                    <p className={requirementLabelStyle}>To unlock</p>
                    <p className="text-xs text-gray-500">
                        <a
                            href="https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml"
                            className="text-blue-600 hover:underline"
                        >
                            Publish an app
                        </a>
                    </p>
                    <p className="text-3xs text-amber-600 mt-0.5">
                        {TIER_EMOJIS.seed} Must be Seed first
                    </p>
                </div>
            </TierCard>
        </div>
    );
};

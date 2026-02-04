import type { FC } from "react";
import { TIER_EMOJIS, TIER_POLLEN } from "@/tier-config.ts";
import { Tooltip } from "../pricing/tooltip.tsx";

const tierBoxBase = "rounded-lg p-3";
const tierColors = {
    microbe: `${tierBoxBase} bg-gray-100/60`,
    spore: `${tierBoxBase} bg-teal-100/60`,
    seed: `${tierBoxBase} bg-amber-100/60`,
    flower: `${tierBoxBase} bg-pink-100/60`,
    nectar: `${tierBoxBase} bg-purple-100/60`,
} as const;

const SeedTooltipContent = () => (
    <div className="w-56">
        <p className="font-semibold text-gray-900 mb-2">Dev Points (need 8+)</p>
        <table className="w-full text-left text-[11px]">
            <tbody>
                <tr className="border-b border-gray-100">
                    <td className="py-1 text-gray-600">Account age</td>
                    <td className="py-1 text-right text-gray-800">
                        0.5pt/month (max 6)
                    </td>
                </tr>
                <tr className="border-b border-gray-100">
                    <td className="py-1 text-gray-600">Commits</td>
                    <td className="py-1 text-right text-gray-800">
                        0.1pt each (max 2)
                    </td>
                </tr>
                <tr className="border-b border-gray-100">
                    <td className="py-1 text-gray-600">Public repos</td>
                    <td className="py-1 text-right text-gray-800">
                        0.5pt each (max 1)
                    </td>
                </tr>
                <tr>
                    <td className="py-1 text-gray-600">GitHub stars</td>
                    <td className="py-1 text-right text-gray-800">
                        0.1pt each (max 5)
                    </td>
                </tr>
            </tbody>
        </table>
        <p className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-500">
            Evaluated daily. No action needed.
        </p>
    </div>
);

export const TierExplanation: FC = () => {
    const requirementLabelStyle =
        "text-[9px] font-semibold text-gray-400 uppercase tracking-wide";

    return (
        <div>
            <p className="text-sm text-gray-900 leading-relaxed mb-3">
                📈 <strong>Grow Your Tier:</strong> For developers building with
                pollinations.ai. Level up to earn more daily pollen.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {/* Microbe */}
                <div className={tierColors.microbe}>
                    <div className="flex items-center gap-1.5">
                        <span>{TIER_EMOJIS.microbe}</span>
                        <strong className="text-gray-800 text-sm">
                            Microbe
                        </strong>
                    </div>
                    <p className="text-xs font-mono text-gray-600 mt-1">
                        {TIER_POLLEN.microbe} pollen/day
                    </p>
                    <div className="mt-1.5 border-t border-gray-200 pt-1.5">
                        <p className={requirementLabelStyle}>To unlock</p>
                        <p className="text-xs text-gray-500">Sign up</p>
                    </div>
                </div>

                {/* Spore */}
                <div className={tierColors.spore}>
                    <div className="flex items-center gap-1.5">
                        <span>{TIER_EMOJIS.spore}</span>
                        <strong className="text-gray-800 text-sm">Spore</strong>
                    </div>
                    <p className="text-xs font-mono text-gray-600 mt-1">
                        {TIER_POLLEN.spore} pollen/day
                    </p>
                    <div className="mt-1.5 border-t border-gray-200 pt-1.5">
                        <p className={requirementLabelStyle}>To unlock</p>
                        <p className="text-xs text-gray-500">Auto-verified</p>
                        <p className="text-[10px] text-emerald-600 mt-0.5">
                            Checked on signup
                        </p>
                    </div>
                </div>

                {/* Seed */}
                <div className={tierColors.seed}>
                    <div className="flex items-center gap-1.5">
                        <span>{TIER_EMOJIS.seed}</span>
                        <strong className="text-gray-800 text-sm">Seed</strong>
                    </div>
                    <p className="text-xs font-mono text-gray-600 mt-1">
                        {TIER_POLLEN.seed} pollen/day
                    </p>
                    <div className="mt-1.5 border-t border-gray-200 pt-1.5">
                        <p className={requirementLabelStyle}>To unlock</p>
                        <p className="text-xs text-gray-500">
                            <Tooltip content={<SeedTooltipContent />}>
                                <span className="underline decoration-dotted cursor-help">
                                    8+ dev points
                                </span>
                            </Tooltip>
                        </p>
                        <p className="text-[10px] text-emerald-600 mt-0.5">
                            Auto-upgraded daily
                        </p>
                    </div>
                </div>

                {/* Flower */}
                <div className={tierColors.flower}>
                    <div className="flex items-center gap-1.5">
                        <span>{TIER_EMOJIS.flower}</span>
                        <strong className="text-gray-800 text-sm">
                            Flower
                        </strong>
                    </div>
                    <p className="text-xs font-mono text-gray-600 mt-1">
                        {TIER_POLLEN.flower} pollen/day
                    </p>
                    <div className="mt-1.5 border-t border-gray-200 pt-1.5">
                        <p className={requirementLabelStyle}>To unlock</p>
                        <p className="text-xs text-gray-500">
                            <a
                                href="https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml"
                                className="text-blue-600 hover:underline"
                            >
                                Publish an app
                            </a>
                        </p>
                        <p className="text-[10px] text-amber-600 mt-0.5">
                            {TIER_EMOJIS.seed} Must be Seed first
                        </p>
                    </div>
                </div>

                {/* Nectar */}
                <div className={tierColors.nectar}>
                    <div className="flex items-center gap-1.5">
                        <span>{TIER_EMOJIS.nectar}</span>
                        <strong className="text-gray-800 text-sm">
                            Nectar
                        </strong>
                    </div>
                    <p className="text-xs font-mono text-gray-600 mt-1">
                        {TIER_POLLEN.nectar} pollen/day
                    </p>
                    <div className="mt-1.5 border-t border-gray-200 pt-1.5">
                        <span className="text-[10px] text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full font-medium">
                            Coming soon 🔮
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

import type { FC } from "react";
import {
    criteriaForTier,
    DISPLAY_TIERS,
    TIER_COLORS,
    TIER_EMOJIS,
    TIER_POLLEN,
    TIER_THRESHOLDS,
    type TierName,
} from "@/tier-config.ts";
import { capitalize } from "@/util.ts";
import { Tooltip } from "../pricing/Tooltip.tsx";

const tierBoxBase = "rounded-lg p-3 flex flex-col";

const ScoringTooltip: FC<{ tier: TierName }> = ({ tier }) => {
    const criteria = criteriaForTier(tier);
    const threshold = TIER_THRESHOLDS[tier];

    return (
        <div className="w-56">
            <p className="font-semibold text-gray-900 mb-2">
                Need {threshold}+ pts
            </p>
            <table className="w-full text-left text-[11px]">
                <tbody>
                    {criteria.map((c, i) => (
                        <tr
                            key={c.field}
                            className={
                                i < criteria.length - 1
                                    ? "border-b border-gray-100"
                                    : ""
                            }
                        >
                            <td className="py-1 text-gray-600">{c.label}</td>
                            <td className="py-1 text-right text-gray-800">
                                up to {c.max} pts
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-500">
                Evaluated daily. No action needed.
            </p>
        </div>
    );
};

const requirementLabelStyle =
    "text-[9px] font-semibold text-gray-400 uppercase tracking-wide";

const TierUnlockInfo: FC<{ tier: TierName }> = ({ tier }) => {
    const threshold = TIER_THRESHOLDS[tier];
    if (threshold == null) return null;

    return (
        <div className="mt-auto pt-1.5 border-t border-gray-200">
            <p className={requirementLabelStyle}>To unlock</p>
            <p className="text-xs text-gray-500">
                <Tooltip content={<ScoringTooltip tier={tier} />}>
                    <span className="underline decoration-dotted cursor-help">
                        {threshold}+ pts
                    </span>
                </Tooltip>
            </p>
        </div>
    );
};

export const TierExplanation: FC = () => (
    <div>
        <p className="text-sm text-gray-900 leading-relaxed mb-3">
            📈 <strong>Grow Your Tier:</strong> Level up to earn more daily
            pollen. Tiers are evaluated and upgraded automatically.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DISPLAY_TIERS.map((tier) => (
                <div
                    key={tier}
                    className={`${tierBoxBase} ${TIER_COLORS[tier] ?? ""}`}
                >
                    <div className="flex items-center gap-1.5">
                        <span>{TIER_EMOJIS[tier]}</span>
                        <strong className="text-gray-800 text-sm">
                            {capitalize(tier)}
                        </strong>
                    </div>
                    <p className="text-xs font-mono text-gray-600 mt-1 whitespace-nowrap">
                        {TIER_POLLEN[tier]} pollen/day
                    </p>
                    <TierUnlockInfo tier={tier} />
                </div>
            ))}
        </div>
    </div>
);

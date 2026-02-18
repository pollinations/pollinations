import type { FC } from "react";
import {
    DISPLAY_TIERS,
    TIER_COLORS,
    TIER_EMOJIS,
    TIER_POLLEN,
    TIER_UPGRADES,
    type TierUpgradeRule,
} from "@/tier-config.ts";
import { capitalize } from "@/util.ts";
import { Tooltip } from "../pricing/Tooltip.tsx";

const tierBoxBase = "rounded-lg p-3";

function formatRate(s: {
    multiplier: number;
    max: number;
    unit: string;
}): string {
    // For "month" units the stored multiplier is per-day; show per-month rate
    const rate = s.unit === "month" ? s.multiplier * 30 : s.multiplier;
    const clean = +rate.toFixed(2);
    return `${clean}pt/${s.unit} (max ${s.max})`;
}

const ScoringTooltip: FC<{ rule: TierUpgradeRule }> = ({ rule }) => (
    <div className="w-64">
        <p className="font-semibold text-gray-900 mb-2">
            {rule.label} — need {rule.threshold}+ pts
        </p>
        <table className="w-full text-left text-[11px]">
            <tbody>
                {rule.criteria.map((c, i) => (
                    <tr
                        key={c.field}
                        className={
                            i < rule.criteria.length - 1
                                ? "border-b border-gray-100"
                                : ""
                        }
                    >
                        <td className="py-1 text-gray-600">{c.label}</td>
                        <td className="py-1 text-right text-gray-800">
                            {formatRate(c)}
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

const requirementLabelStyle =
    "text-[9px] font-semibold text-gray-400 uppercase tracking-wide";

const TierUnlockInfo: FC<{ tier: string }> = ({ tier }) => {
    const rule = TIER_UPGRADES.find((r) => r.to === tier);

    if (tier === "nectar") {
        return (
            <div className="mt-1.5 border-t border-gray-200 pt-1.5">
                <span className="text-[10px] text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full font-medium">
                    Coming soon 🔮
                </span>
            </div>
        );
    }

    if (tier === "microbe") {
        return (
            <div className="mt-1.5 border-t border-gray-200 pt-1.5">
                <p className={requirementLabelStyle}>To unlock</p>
                <p className="text-xs text-gray-500">Sign up</p>
            </div>
        );
    }

    if (!rule) return null;

    const prerequisiteTier = rule.from[rule.from.length - 1];

    return (
        <div className="mt-1.5 border-t border-gray-200 pt-1.5">
            <p className={requirementLabelStyle}>To unlock</p>
            <p className="text-xs text-gray-500">
                <Tooltip content={<ScoringTooltip rule={rule} />}>
                    <span className="underline decoration-dotted cursor-help">
                        {rule.label}
                    </span>
                </Tooltip>
            </p>
            {rule.auto && (
                <p className="text-[10px] text-emerald-600 mt-0.5">
                    Auto-upgraded daily
                </p>
            )}
            {prerequisiteTier && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                    {TIER_EMOJIS[prerequisiteTier]} Requires{" "}
                    {capitalize(prerequisiteTier)}
                </p>
            )}
        </div>
    );
};

export const TierExplanation: FC = () => (
    <div>
        <p className="text-sm text-gray-900 leading-relaxed mb-3">
            📈 <strong>Grow Your Tier:</strong> For developers building with
            pollinations.ai. Level up to earn more daily pollen.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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
                    <p className="text-xs font-mono text-gray-600 mt-1">
                        {TIER_POLLEN[tier]} pollen/day
                    </p>
                    <TierUnlockInfo tier={tier} />
                </div>
            ))}
        </div>
    </div>
);

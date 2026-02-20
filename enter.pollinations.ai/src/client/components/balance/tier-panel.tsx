import type { FC } from "react";
import {
    getNextTier,
    getTierEmoji,
    TIER_THRESHOLDS,
    TIERS,
    type TierName,
    type TierStatus,
} from "@/tier-config.ts";
import { Card } from "../ui/card.tsx";
import { Panel } from "../ui/panel.tsx";
import { BYOPCallout } from "./byop-callout.tsx";
import { LevelUpCards } from "./level-up-cards.tsx";

const APPEAL_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=tier-appeal.yml";

// Ring gauge colors — more saturated than the Tailwind 300-shade gauge colors
const TIER_RING_COLORS: Record<
    string,
    { fill: string; bg: string; border: string }
> = {
    microbe: { fill: "#9ca3af", bg: "#f3f4f6", border: "#e5e7eb" },
    spore: { fill: "#3a7ca5", bg: "#dbeafe", border: "#93c5fd" },
    seed: { fill: "#45a06e", bg: "#dcfce7", border: "#86efac" },
    flower: { fill: "#d4749a", bg: "#fce7f3", border: "#f9a8d4" },
    nectar: { fill: "#f5a623", bg: "#fef3c7", border: "#fcd34d" },
};

// --- Ring Gauge ---

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ~326.73

const TierRingGauge: FC<{
    tier: TierStatus;
    creatorPoints: number;
    dailyPollen: number;
}> = ({ tier, creatorPoints, dailyPollen }) => {
    const isPreSeed = tier === "microbe" || tier === "spore" || tier === "none";
    const isNectar = tier === "nectar";

    let colors = TIER_RING_COLORS.microbe;
    let progressPct: number;
    let centerEmoji: string;
    let tierLabel: string;
    let grantLabel: string;

    // Next-tier info split for styled rendering
    let nextHighlight = "";
    let nextRest = "";
    let nextMilestone = "";

    if (isPreSeed) {
        colors = TIER_RING_COLORS.spore;
        progressPct = Math.min(1, creatorPoints / TIER_THRESHOLDS.seed);
        centerEmoji = "🌱";
        tierLabel = "Spore";
        grantLabel = "1.5 pollen / week";
        const remaining = Math.max(0, TIER_THRESHOLDS.seed - creatorPoints);
        nextHighlight = `Earn ${remaining} more points`;
        nextRest = "to unlock 🌿 Seed";
        nextMilestone = "Start receiving daily grants";
    } else if (isNectar) {
        colors = TIER_RING_COLORS.nectar;
        progressPct = 1;
        centerEmoji = getTierEmoji(tier);
        tierLabel = TIERS.nectar.displayName;
        grantLabel = `${dailyPollen} pollen / day`;
        nextRest =
            "You're at the top. Biggest daily grants. First in line for revenue share.";
    } else {
        const tierKey = tier as TierName;
        colors = TIER_RING_COLORS[tierKey] || TIER_RING_COLORS.microbe;
        centerEmoji = getTierEmoji(tier);
        tierLabel = TIERS[tierKey].displayName;
        grantLabel = `${dailyPollen} pollen / day`;

        const next = getNextTier(tier);
        if (next) {
            const currentThreshold = TIERS[tierKey].threshold;
            const range = next.threshold - currentThreshold;
            progressPct =
                range > 0
                    ? Math.min(1, (creatorPoints - currentThreshold) / range)
                    : 1;
            const remaining = Math.max(0, next.threshold - creatorPoints);
            const nextEmoji = getTierEmoji(next.name);
            nextHighlight = `${remaining} more points`;
            nextRest = `to reach ${nextEmoji} ${TIERS[next.name].displayName}`;
            nextMilestone = `Next milestone: ${TIERS[next.name].pollen} pollen/day`;
        } else {
            progressPct = 1;
        }
    }

    // Always show at least a small dot so the ring looks "started"
    const visiblePct = Math.max(0.02, progressPct);
    const strokeDashoffset = RING_CIRCUMFERENCE * (1 - visiblePct);

    return (
        <div className="flex items-center gap-8 flex-col sm:flex-row">
            {/* Ring */}
            <div className="relative w-[140px] h-[140px] flex-shrink-0">
                <svg
                    viewBox="0 0 120 120"
                    className="w-full h-full"
                    style={{ transform: "rotate(-90deg)" }}
                    role="img"
                    aria-label={`${tierLabel} tier progress`}
                >
                    <title>{tierLabel} tier progress</title>
                    {/* Border ring */}
                    <circle
                        cx="60"
                        cy="60"
                        r={RING_RADIUS}
                        fill="none"
                        stroke={colors.fill}
                        strokeOpacity={0.25}
                        strokeWidth="14"
                    />
                    {/* Track ring */}
                    <circle
                        cx="60"
                        cy="60"
                        r={RING_RADIUS}
                        fill="none"
                        stroke="#ffffff"
                        strokeOpacity={0.5}
                        strokeWidth="12"
                    />
                    <circle
                        cx="60"
                        cy="60"
                        r={RING_RADIUS}
                        fill="none"
                        stroke={colors.fill}
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={RING_CIRCUMFERENCE}
                        strokeDashoffset={strokeDashoffset}
                        style={{
                            transition: "stroke-dashoffset 1s ease",
                        }}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[28px] leading-none">
                        {centerEmoji}
                    </span>
                    <span className="text-xl font-bold text-gray-900 mt-0.5">
                        {creatorPoints}
                    </span>
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest">
                        points
                    </span>
                </div>
            </div>

            {/* Info */}
            <div className="flex flex-col gap-1 text-center sm:text-left">
                <div className="flex items-center gap-2">
                    <p className="text-2xl font-semibold text-gray-900">
                        {tierLabel}
                    </p>
                    <span
                        className="px-3 py-0.5 rounded-full text-xs font-semibold border"
                        style={{
                            backgroundColor: colors.bg,
                            borderColor: colors.border,
                            color: colors.fill,
                        }}
                    >
                        {grantLabel}
                    </span>
                </div>
                <p className="text-xs text-gray-400">
                    Refills daily at 00:00 UTC. Unused pollen does not carry
                    over.
                </p>
                {(nextHighlight || nextRest) && (
                    <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                        {nextHighlight && (
                            <strong className="text-amber-600">
                                {nextHighlight}
                            </strong>
                        )}
                        {nextHighlight && nextRest && " "}
                        {nextRest}
                        {nextMilestone && (
                            <>
                                <br />
                                {nextMilestone}
                            </>
                        )}
                    </p>
                )}
                <p className="text-[11px] text-gray-400 mt-2">
                    <a
                        href={APPEAL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                    >
                        Something wrong? Appeal your tier &rarr;
                    </a>
                </p>
            </div>
        </div>
    );
};

// --- TierPanel (main export) ---

export type TierPanelProps = {
    active: {
        tier: TierStatus;
        displayName: string;
        dailyPollen?: number;
    };
};

export const TierPanel: FC<TierPanelProps> = ({ active }) => {
    const tier = active.tier;
    const dailyPollen = active.dailyPollen ?? 0;
    // FIXME: placeholder — derive real score from D1 once the scoring pipeline lands.
    // Currently fakes creatorPoints as the tier's own threshold so the gauge looks reasonable.
    const creatorPoints =
        TIER_THRESHOLDS[tier as keyof typeof TIER_THRESHOLDS] ?? 0;

    return (
        <Panel color="amber">
            <div className="flex flex-col gap-3">
                <TierRingGauge
                    tier={tier}
                    creatorPoints={creatorPoints}
                    dailyPollen={dailyPollen}
                />

                <div className="flex flex-col gap-3">
                    <Card color="amber">
                        <LevelUpCards />
                    </Card>

                    <Card color="amber">
                        <BYOPCallout />
                    </Card>
                </div>
            </div>
        </Panel>
    );
};

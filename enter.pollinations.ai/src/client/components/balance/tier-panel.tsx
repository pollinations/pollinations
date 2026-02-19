import type { FC } from "react";
import {
    getTierEmoji,
    TIER_COLORS,
    TIER_EMOJIS,
    TIER_GAUGE_COLORS,
    TIER_PROGRESSION,
    TIER_THRESHOLDS,
    TIERS,
    type TierStatus,
} from "@/tier-config.ts";
import { Badge } from "../ui/badge.tsx";
import { Card } from "../ui/card.tsx";
import { Panel } from "../ui/panel.tsx";
import { BYOPCallout } from "./byop-callout.tsx";
import { LevelUpCards } from "./level-up-cards.tsx";

const APPEAL_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=tier-appeal.yml";

const SCORING_URL =
    "https://github.com/pollinations/pollinations/blob/main/SCORING.md";

// --- Tier Gauge with threshold markers ---

// Visible tiers on the gauge (excludes microbe and router)
const GAUGE_TIERS = TIER_PROGRESSION.filter((t) => t !== "microbe").map(
    (t) => ({
        key: t,
        name: TIERS[t].displayName,
    }),
);

// Build gauge segments from tier config
function buildGaugeSegments() {
    const progression = TIER_PROGRESSION;
    const segments: {
        start: number;
        end: number;
        color: string;
    }[] = [];

    for (let i = 0; i < progression.length; i++) {
        const tier = progression[i];
        const nextTier = progression[i + 1];
        segments.push({
            start: TIER_THRESHOLDS[tier],
            end: nextTier
                ? TIER_THRESHOLDS[nextTier]
                : Number.POSITIVE_INFINITY,
            color: TIER_GAUGE_COLORS[tier],
        });
    }
    return segments;
}

const TIER_SEGMENTS = buildGaugeSegments();

// Dimmed version of a hex color (mix toward white)
function dimColor(hex: string): string {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    const mix = (c: number) =>
        Math.round(c + (255 - c) * 0.5)
            .toString(16)
            .padStart(2, "0");
    return `#${mix(r)}${mix(g)}${mix(b)}`;
}

const TierGauge: FC<{ creatorPoints: number }> = ({ creatorPoints }) => {
    // Open-ended gauge: scales with user's points, nectar is just a marker
    const gaugeMax = Math.max(
        TIER_THRESHOLDS.nectar * 1.2,
        creatorPoints * 1.2,
    );
    const fillPct = Math.min(100, (creatorPoints / gaugeMax) * 100);

    // Fill gradient (reached portion)
    const fillStops: string[] = [];
    if (creatorPoints > 0) {
        for (const seg of TIER_SEGMENTS) {
            if (seg.start >= creatorPoints) break;
            const startPct = (seg.start / creatorPoints) * 100;
            const endPct =
                (Math.min(seg.end, creatorPoints) / creatorPoints) * 100;
            fillStops.push(
                `${seg.color} ${startPct}%`,
                `${seg.color} ${endPct}%`,
            );
        }
    }
    const fillBg =
        fillStops.length > 0
            ? `linear-gradient(to right, ${fillStops.join(", ")})`
            : TIER_GAUGE_COLORS.microbe;

    // Track gradient (full width, dimmed colors preview)
    const trackStops: string[] = [];
    for (const seg of TIER_SEGMENTS) {
        const dim = dimColor(seg.color);
        const startPct = (seg.start / gaugeMax) * 100;
        const endPct = (Math.min(seg.end, gaugeMax) / gaugeMax) * 100;
        trackStops.push(`${dim} ${startPct}%`, `${dim} ${endPct}%`);
    }
    const trackBg = `linear-gradient(to right, ${trackStops.join(", ")})`;

    return (
        <div>
            {/* Gauge bar — color changes at each tier boundary, scores inside */}
            <div className="relative h-5 mt-7">
                <div
                    className="h-full rounded-full overflow-hidden"
                    style={{ background: trackBg }}
                >
                    <div
                        className="h-full transition-all duration-500"
                        style={{
                            width: `${fillPct}%`,
                            background: fillBg,
                        }}
                    />
                </div>
                {GAUGE_TIERS.map((t) => {
                    const pos = (TIER_THRESHOLDS[t.key] / gaugeMax) * 100;
                    const isReached = creatorPoints >= TIER_THRESHOLDS[t.key];
                    return (
                        <span
                            key={t.key}
                            className={`absolute top-1/2 -translate-y-1/2 text-[10px] font-mono whitespace-nowrap ${isReached ? "text-gray-600" : "text-gray-400"}`}
                            style={{
                                left: `${pos + 1}%`,
                            }}
                        >
                            {TIER_THRESHOLDS[t.key]}
                        </span>
                    );
                })}
                {/* Current position marker — droplet with score */}
                {(() => {
                    // Pick the color of the tier segment the user is in
                    let dropletColor = TIER_SEGMENTS[0].color;
                    for (let i = TIER_SEGMENTS.length - 1; i >= 0; i--) {
                        if (creatorPoints >= TIER_SEGMENTS[i].start) {
                            dropletColor = TIER_SEGMENTS[i].color;
                            break;
                        }
                    }
                    return (
                        <div
                            className="absolute transition-all duration-500 flex flex-col items-center"
                            style={{
                                left: `${fillPct}%`,
                                bottom: "100%",
                                transform: "translateX(-50%)",
                            }}
                        >
                            <div
                                className="flex items-center justify-center rounded-full text-xs font-bold"
                                style={{
                                    minWidth: "26px",
                                    height: "26px",
                                    padding: "0 6px",
                                    backgroundColor: dropletColor,
                                    color: "#1f2937",
                                }}
                            >
                                {creatorPoints}
                            </div>
                            <div
                                style={{
                                    width: 0,
                                    height: 0,
                                    marginTop: "-2px",
                                    borderLeft: "6px solid transparent",
                                    borderRight: "6px solid transparent",
                                    borderTop: `7px solid ${dropletColor}`,
                                }}
                            />
                        </div>
                    );
                })()}
            </div>

            {/* Tier names below the bar */}
            <div className="relative h-6 mt-1">
                {GAUGE_TIERS.map((t) => {
                    const pos = (TIER_THRESHOLDS[t.key] / gaugeMax) * 100;
                    const isReached = creatorPoints >= TIER_THRESHOLDS[t.key];
                    return (
                        <span
                            key={t.key}
                            className={`absolute top-0 text-xs whitespace-nowrap ${isReached ? "text-gray-700 font-semibold" : "text-gray-400"}`}
                            style={{
                                left: `${pos}%`,
                                transform: "translateX(-50%)",
                            }}
                        >
                            {TIER_EMOJIS[t.key]} {t.name}
                        </span>
                    );
                })}
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
    const displayName = active.displayName || "Unknown Tier";
    const dailyPollen = active.dailyPollen ?? 0;
    // FIXME: placeholder — derive real score from D1 once the scoring pipeline lands.
    // Currently fakes creatorPoints as the tier's own threshold so the gauge looks reasonable.
    const creatorPoints =
        TIER_THRESHOLDS[tier as keyof typeof TIER_THRESHOLDS] ?? 0;
    const isMicrobe = tier === "microbe" || tier === "none";
    const emoji = getTierEmoji(tier);
    const badgeColor = (
        tier === "none" ? TIER_COLORS.microbe : TIER_COLORS[tier]
    ) as "gray" | "green" | "pink" | "amber" | "blue" | "red";

    return (
        <Panel color="amber">
            <div className="flex flex-col gap-3">
                {isMicrobe ? (
                    <p className="text-sm text-gray-700">
                        Earn a builder score of {TIER_THRESHOLDS.spore} to
                        unlock your first tier.
                    </p>
                ) : (
                    <>
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-3xl font-bold text-gray-900">
                                {emoji} {displayName}
                            </span>
                            <Badge
                                color={badgeColor}
                                size="lg"
                                className="font-semibold"
                            >
                                {dailyPollen} pollen/day
                            </Badge>
                        </div>
                        <p className="text-sm text-gray-500">
                            Refills daily at 00:00 UTC. Unused pollen does not
                            carry over.
                        </p>
                    </>
                )}

                <TierGauge creatorPoints={creatorPoints} />

                <Card color="amber">
                    <LevelUpCards />

                    <div className="mt-3 pt-3 border-t border-gray-200">
                        <BYOPCallout />
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500 space-y-1">
                        <p>
                            <a
                                href={SCORING_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-gray-700"
                            >
                                See full scoring rules &rarr;
                            </a>
                        </p>
                        <p className="text-gray-400">
                            ✨ We're in beta! Scores and grants may evolve as we
                            learn what works best.
                        </p>
                    </div>
                </Card>

                <p className="text-[11px] text-gray-400">
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
        </Panel>
    );
};

import type { FC } from "react";
import {
    getNextTier,
    getTierEmoji,
    TIER_COLORS,
    TIER_PROGRESSION,
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
const APPS_URL = "https://pollinations.ai/apps";
const APIDOCS_URL =
    "https://github.com/pollinations/pollinations/blob/main/APIDOCS.md";

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

// Text colors for tier highlights (600 shade)
const TIER_TEXT_COLORS: Record<string, string> = {
    gray: "#4b5563",
    blue: "#2563eb",
    green: "#16a34a",
    pink: "#db2777",
    amber: "#d97706",
    red: "#dc2626",
};

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ~326.73

// ─── Microbe: Account Under Review ──────────────────────────

const MicrobeLimitedPanel: FC = () => (
    <Panel color={TIER_COLORS.microbe as "gray"}>
        <div className="flex flex-col gap-3">
            <div className="text-sm text-gray-600 leading-relaxed">
                <p>
                    Your tier is determined dynamically based on your activity
                    and account history.
                </p>
                <p>
                    It can change at any time, initial review can take up to a
                    week.
                </p>
            </div>
            <p className="text-sm">
                💬 Questions?{" "}
                <a
                    href={APPEAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-900 underline hover:text-gray-700 font-medium"
                >
                    Contact support &rarr;
                </a>
            </p>
        </div>
    </Panel>
);

// ─── Spore: Free weekly grant (no tier branding) ────────────

const SporeGrantInfo: FC = () => (
    <div className="flex flex-col gap-1">
        <p className="text-2xl font-semibold text-gray-900">
            🐝 Free Weekly : 1.5 pollen
        </p>
        <p className="text-xs text-gray-400">
            Refreshes every Monday at 00:00 UTC. Use it across any{" "}
            <a
                href={APPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
            >
                app on the platform
            </a>
            .
        </p>
    </div>
);

const SporeCreatorNudge: FC = () => (
    <div>
        <p className="text-sm font-bold text-gray-900 mb-3">
            🛠 Want to build your own app?
        </p>
        <div className="flex text-xs gap-3">
            <div className="flex-1 text-sm text-gray-600 leading-relaxed">
                <p>
                    Creators get daily Pollen grants &mdash; up to 20/day
                    &mdash; plus tools to monetize and grow. Start building and
                    your score will unlock creator tiers automatically.
                </p>
                <div className="mt-3 space-y-1">
                    <div>
                        <a
                            href={APIDOCS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline hover:text-blue-800 font-medium"
                        >
                            Start creating &rarr;
                        </a>
                    </div>
                    <div>
                        <a
                            href="#what-are-tiers"
                            className="text-blue-600 underline hover:text-blue-800 font-medium"
                        >
                            How do tiers work? &rarr;
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

const SporeTierPanel: FC = () => (
    <Panel color={TIER_COLORS.spore as "blue"}>
        <div className="flex flex-col gap-3">
            <SporeGrantInfo />
            <Card color={TIER_COLORS.spore as "blue"}>
                <SporeCreatorNudge />
            </Card>
            <div className="bg-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
                🧪 <strong>We're in Beta!</strong> Scores and grants may evolve.
            </div>
        </div>
    </Panel>
);

// ─── Creator: Seed / Flower / Nectar ────────────────────────

const CreatorRingGauge: FC<{
    tier: TierStatus;
    creatorPoints: number;
    pollen: number;
}> = ({ tier, creatorPoints, pollen }) => {
    const isNectar = tier === "nectar";
    const tierKey = tier as TierName;

    const colors = TIER_RING_COLORS[tierKey] || TIER_RING_COLORS.microbe;
    const tierColor = TIER_COLORS[tierKey] || "gray";
    const centerEmoji = getTierEmoji(tier);
    const tierLabel = TIERS[tierKey].displayName;
    const grantLabel = `${pollen} pollen / day`;

    let progressPct: number;
    let nextHighlight = "";
    let nextRest = "";
    let nextMilestone = "";

    if (isNectar) {
        progressPct = 1;
        nextRest =
            "You're at the top. Biggest daily grants. First in line for revenue share.";
    } else {
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
                            <strong
                                style={{ color: TIER_TEXT_COLORS[tierColor] }}
                            >
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

// ─── Helpers ────────────────────────────────────────────────

/** Given a point count, return the matching tier name + pollen grant. */
function tierForPoints(points: number): {
    tier: TierName;
    pollen: number;
} {
    // Walk progression in reverse to find the highest matching tier
    for (let i = TIER_PROGRESSION.length - 1; i >= 0; i--) {
        const name = TIER_PROGRESSION[i];
        if (points >= TIERS[name].threshold) {
            return { tier: name, pollen: TIERS[name].pollen };
        }
    }
    return { tier: "microbe", pollen: TIERS.microbe.pollen };
}

// ─── TierPanel (main export) ────────────────────────────────

export type TierPanelProps = {
    active: {
        tier: TierStatus;
        displayName: string | null;
        pollen?: number;
    };
    pointsOverride?: number | null;
};

export const TierPanel: FC<TierPanelProps> = ({ active, pointsOverride }) => {
    const isOverriding =
        pointsOverride !== null && pointsOverride !== undefined;
    const resolved = isOverriding ? tierForPoints(pointsOverride) : null;

    const tier = resolved?.tier ?? active.tier;
    const pollen = resolved?.pollen ?? active.pollen ?? 0;
    const creatorPoints = isOverriding
        ? pointsOverride
        : (TIER_THRESHOLDS[tier as keyof typeof TIER_THRESHOLDS] ?? 0);

    if (tier === "microbe") {
        return <MicrobeLimitedPanel />;
    }

    if (tier === "spore" || tier === "none") {
        return <SporeTierPanel />;
    }

    // Creator tiers: seed, flower, nectar
    type PanelColor =
        | "blue"
        | "teal"
        | "violet"
        | "purple"
        | "amber"
        | "green"
        | "pink"
        | "gray";
    type CardColor =
        | "amber"
        | "blue"
        | "green"
        | "violet"
        | "purple"
        | "teal"
        | "red"
        | "yellow"
        | "gray"
        | "pink";
    const tierColor = (TIER_COLORS[tier as TierName] || "amber") as PanelColor &
        CardColor;
    return (
        <Panel color={tierColor}>
            <div className="flex flex-col gap-3">
                <CreatorRingGauge
                    tier={tier}
                    creatorPoints={creatorPoints}
                    pollen={pollen}
                />
                <div className="flex flex-col gap-3">
                    <Card color={tierColor}>
                        <LevelUpCards
                            color={
                                tierColor as
                                    | "amber"
                                    | "green"
                                    | "pink"
                                    | "blue"
                                    | "gray"
                            }
                        />
                    </Card>
                    <Card color={tierColor}>
                        <BYOPCallout />
                    </Card>
                </div>
            </div>
        </Panel>
    );
};

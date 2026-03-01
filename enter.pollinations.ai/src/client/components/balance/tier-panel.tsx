import type { FC } from "react";
import { getTierColor, getTierEmoji, type TierStatus } from "@/tier-config.ts";
import { Badge } from "../ui/badge.tsx";
import { Card } from "../ui/card.tsx";
import { Panel } from "../ui/panel.tsx";
import { TierExplanation } from "./tier-explanation";

const APPEAL_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=tier-appeal.yml";

// Map tier color to Badge component color (Badge doesn't support "red", use "blue" for router)
function getBadgeColor(
    tier: TierStatus,
): "gray" | "green" | "pink" | "amber" | "blue" {
    const tierColor = tier === "none" ? "gray" : getTierColor(tier);
    // Badge component doesn't have "red" variant, map router's "red" to "blue"
    if (tierColor === "red") return "blue";
    // All other tier colors (gray, blue, green, pink, amber) are valid Badge colors
    return tierColor as "gray" | "green" | "pink" | "amber" | "blue";
}

// Map tier color to Panel component color (Panel doesn't support "red", use "blue" for router)
function getPanelColor(
    tier: TierStatus,
): "blue" | "amber" | "green" | "pink" | "gray" {
    const tierColor = tier === "none" ? "gray" : getTierColor(tier);
    // Panel component doesn't have "red" variant, map router's "red" to "blue"
    if (tierColor === "red") return "blue";
    // All other tier colors (gray, blue, green, pink, amber) are valid Panel colors
    return tierColor as "blue" | "amber" | "green" | "pink" | "gray";
}

const BetaNoticeText: FC = () => (
    <p className="text-sm font-medium text-gray-900 mt-3">
        🧪 <strong>We're in beta!</strong> Pollen values and tier rules may
        evolve as we learn what works best.
    </p>
);

// ─── Microbe: Account Under Review ──────────────────────────

const MicrobeLimitedPanel: FC = () => (
    <Panel color="gray">
        <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600 leading-relaxed">
                We're verifying that your account belongs to a real person. This
                usually takes a few days.
            </p>
            <p className="text-sm">
                📧 Questions about your tier?{" "}
                <a
                    href={APPEAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-900 underline hover:text-gray-700 font-medium"
                >
                    Contact us &rarr;
                </a>
            </p>
            <BetaNoticeText />
        </div>
    </Panel>
);

// ─── Tier screen (spore + creator tiers) ─────────────────────

const TierScreen: FC<{
    tier: TierStatus;
    active_tier_name: string;
    pollen: number;
    cadence: "daily" | "weekly";
}> = ({ tier, active_tier_name, pollen, cadence }) => {
    const tierEmoji = getTierEmoji(tier);
    const panelColor = getPanelColor(tier);
    const cardColor = panelColor;
    const isWeekly = cadence === "weekly";

    return (
        <Panel color={panelColor}>
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-3xl font-bold text-gray-900">
                        {tierEmoji} {active_tier_name}
                    </span>
                    <Badge
                        color={getBadgeColor(tier)}
                        size="lg"
                        className="font-semibold"
                    >
                        {pollen} pollen/{isWeekly ? "week" : "day"}
                    </Badge>
                </div>

                <p className="text-sm text-gray-500">
                    {isWeekly
                        ? "Refreshes every Monday at 00:00 UTC. Unused pollen does not carry over."
                        : "Refills daily at 00:00 UTC. Unused pollen does not carry over."}
                </p>

                <p className="text-sm">
                    📧 Questions about your tier?{" "}
                    <a
                        href={APPEAL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-900 underline hover:text-gray-700 font-medium"
                    >
                        Contact us &rarr;
                    </a>
                </p>

                <Card color={cardColor}>
                    <TierExplanation currentTier={tier} />
                </Card>

                <BetaNoticeText />
            </div>
        </Panel>
    );
};

type TierPanelProps = {
    active: {
        tier: TierStatus;
        displayName: string;
        pollen?: number;
        cadence?: "daily" | "weekly";
    };
};

export const TierPanel: FC<TierPanelProps> = ({ active }) => {
    const { tier, pollen, cadence } = active;

    if (tier === "microbe") {
        return <MicrobeLimitedPanel />;
    }

    return (
        <TierScreen
            tier={tier}
            active_tier_name={active.displayName}
            pollen={pollen ?? 0}
            cadence={cadence ?? "daily"}
        />
    );
};

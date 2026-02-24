import type { FC } from "react";
import { getTierColor, getTierEmoji, type TierStatus } from "@/tier-config.ts";
import { Badge } from "../ui/badge.tsx";
import { Card } from "../ui/card.tsx";
import { Panel } from "../ui/panel.tsx";
import { TierExplanation } from "./tier-explanation";

const APPEAL_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=tier-appeal.yml";
const APPS_URL = "https://pollinations.ai/apps";
const APIDOCS_URL = "/api/docs#api/description/quick-start";

const TIER_BADGE_COLOR: Record<
    TierStatus,
    "gray" | "green" | "pink" | "amber" | "blue" | "yellow"
> = {
    none: "gray",
    microbe: "gray",
    seed: "green",
    flower: "pink",
    nectar: "amber",
    router: "blue",
    spore: "yellow",
};

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

// ─── Spore: Free weekly grant (no tier branding) ────────────

const SporeGrantInfo: FC = () => (
    <div className="flex flex-col gap-3">
        <p className="text-3xl font-bold text-gray-900">
            🐝 Free Weekly : 1.5 pollen
        </p>
        <p className="text-sm text-gray-500">
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
                            href="#how-do-pollen-grants-work"
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
    <Panel color="blue">
        <div className="flex flex-col gap-3">
            <SporeGrantInfo />
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
            <Card color="blue">
                <SporeCreatorNudge />
            </Card>
            <BetaNoticeText />
        </div>
    </Panel>
);

// ─── Creator tiers & fallback ────────────────────────────────

const NoTierScreen: FC<{ has_polar_error?: boolean }> = ({
    has_polar_error,
}) => (
    <Panel color="amber">
        <div className="flex flex-col gap-3">
            {has_polar_error ? (
                <Card color="red" bg="bg-red-50">
                    <p className="text-sm text-red-700 leading-relaxed">
                        ❌ <strong>Unable to Fetch Subscription Status:</strong>{" "}
                        We couldn't connect to the subscription service. Please
                        refresh the page or try again later.
                    </p>
                </Card>
            ) : (
                <Card color="yellow" bg="bg-yellow-50">
                    <p className="text-sm text-yellow-900 leading-relaxed">
                        ⏳ <strong>Setting Up Your Subscription:</strong> Your
                        subscription is being activated. Please refresh the page
                        in 1-2 minutes.
                    </p>
                </Card>
            )}
            <Card color="amber">
                <TierExplanation />
                <BetaNoticeText />
            </Card>
        </div>
    </Panel>
);

const TierScreen: FC<{
    tier: TierStatus;
    active_tier_name: string;
    daily_pollen: number;
}> = ({ tier, active_tier_name, daily_pollen }) => {
    const tierEmoji = getTierEmoji(tier);
    const tierColor =
        tier !== "none" ? getTierColor(tier as any) : getTierColor("spore");

    return (
        <Panel color={tierColor as any}>
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-3xl font-bold text-gray-900">
                        {tierEmoji} {active_tier_name}
                    </span>
                    <Badge
                        color={TIER_BADGE_COLOR[tier]}
                        size="lg"
                        className="font-semibold"
                    >
                        {daily_pollen} pollen/day
                    </Badge>
                </div>

                <p className="text-sm text-gray-500">
                    Refills daily at 00:00 UTC. Unused pollen does not carry
                    over.
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

                <Card color={tierColor as any}>
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
        displayName: string | null;
        pollen?: number;
        cadence?: "daily" | "weekly";
    };
};

export const TierPanel: FC<TierPanelProps> = ({ active }) => {
    const { tier, pollen } = active;

    if (tier === "microbe") {
        return <MicrobeLimitedPanel />;
    }

    if (tier === "spore" || tier === "none") {
        return <SporeTierPanel />;
    }

    // For creator tiers (seed, flower, nectar, router), use existing TierScreen
    const displayName = active.displayName || "Unknown Tier";
    const displayPollen = pollen ?? 0;

    return (
        <TierScreen
            tier={tier}
            active_tier_name={displayName}
            daily_pollen={displayPollen}
        />
    );
};

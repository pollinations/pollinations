import { useEffect, useState, type FC } from "react";
import { TierExplanation } from "./tier-explanation";
import { TierName, TierStatus } from "../../utils/polar.ts";
import type {
    TiersRoutes,
    TierSubscriptionStatus,
} from "../../routes/tiers.ts";

// Badge colors for each tier level
const TIER_BADGE_COLORS: Record<TierStatus, string> = {
    none: "bg-gray-100 border border-gray-400 text-gray-800",
    seed: "bg-emerald-100 border border-emerald-400 text-emerald-800",
    flower: "bg-fuchsia-100 border border-fuchsia-400 text-fuchsia-800",
    nectar: "bg-amber-100 border border-amber-400 text-amber-800",
    router: "bg-blue-100 border border-blue-400 text-blue-800",
    spore: "bg-yellow-100 border border-yellow-400 text-yellow-800",
};

// Common container wrapper for tier screens
const TierContainer: FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="rounded-2xl p-6 border-2 border-gray-200 bg-gray-50/30">
        <div className="flex flex-col gap-3">{children}</div>
    </div>
);

const BetaNotice = () => (
    <div className="bg-linear-to-r from-gray-100 to-slate-100 rounded-xl p-4 border border-gray-300 mt-3">
        <p className="text-sm font-medium text-gray-900">
            ✨ <strong>We're in beta!</strong> We're learning what works best
            for our community and may adjust pollen values and tier rules as we
            go. Thanks for being part of the journey!
        </p>
    </div>
);

function formatCountdown(targetDate: Date): string {
    const diff = targetDate.getTime() - Date.now();
    if (diff <= 0) return "0h 0m";

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
}

const NoTierScreen: FC<{ has_polar_error?: boolean }> = ({
    has_polar_error,
}) => {
    return (
        <TierContainer>
            {has_polar_error ? (
                <p className="text-sm text-red-700 leading-relaxed px-1">
                    ❌ <strong>Unable to Fetch Subscription Status:</strong> We
                    couldn't connect to the subscription service. Please refresh
                    the page or try again later.
                </p>
            ) : (
                <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-900 leading-relaxed">
                        ⏳ <strong>Setting Up Your Subscription:</strong> Your
                        subscription is being activated. Please refresh the page
                        in 1-2 minutes.
                    </p>
                </div>
            )}
            <TierExplanation />
            <BetaNotice />
        </TierContainer>
    );
};

const TierScreen: FC<{
    tier: TierStatus;
    countdown: string;
    active_tier_name: string;
    daily_pollen: number;
    subscription_canceled_at?: string;
    subscription_ends_at?: string;
}> = ({
    tier,
    countdown,
    active_tier_name,
    daily_pollen,
    subscription_canceled_at,
    subscription_ends_at,
}) => {
    const badgeColors = TIER_BADGE_COLORS[tier];

    // Detect cancellation
    const isCanceled = !!subscription_canceled_at && !!subscription_ends_at;

    return (
        <TierContainer>
            <div className="flex items-center gap-3 flex-wrap">
                <span className="text-3xl font-bold text-gray-900">
                    {active_tier_name}
                </span>
                <span
                    className={`inline-flex items-center px-3 py-1 rounded-full font-semibold text-sm ${badgeColors}`}
                >
                    {daily_pollen} pollen/day
                </span>
                <span
                    className={`inline-flex items-center px-3 py-1 rounded-full font-semibold text-sm ${isCanceled ? "bg-yellow-50 border border-yellow-200 text-yellow-900" : "bg-blue-100 border border-blue-300 text-blue-800"}`}
                >
                    ⏱ {countdown}
                </span>
            </div>

            {isCanceled ? (
                <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900 leading-relaxed">
                        🔄 Cancellation pending – but don't worry, you'll be
                        automatically resubscribed to keep your {daily_pollen}{" "}
                        daily pollen.
                    </p>
                </div>
            ) : (
                <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-900 leading-relaxed">
                        ✓ Your subscription is active and earns you{" "}
                        {daily_pollen} pollen daily. Unused pollen does not
                        carry over.
                    </p>
                </div>
            )}
            <TierExplanation />
            <BetaNotice />
        </TierContainer>
    );
};

type TierPanelProps = {
    target: TierName;
    active: {
        tier: TierStatus;
        displayName: string;
        subscriptionDetails?: {
            status: "active" | "canceled" | "trialing" | "none";
            endsAt?: string;
            canceledAt?: string;
            nextRefillAt?: string;
            dailyPollen?: number;
        };
    };
};

export const TierPanel: FC<TierPanelProps> = ({ target, active }) => {
    // Hooks must be called before any conditional returns
    const [countdown, setCountdown] = useState<string>(
        formatCountdown(
            new Date(active.subscriptionDetails?.nextRefillAt || ""),
        ),
    );

    useEffect(() => {
        const id = setInterval(() => {
            setCountdown(
                formatCountdown(
                    new Date(active.subscriptionDetails?.nextRefillAt || ""),
                ),
            );
        }, 60000);
        return () => clearInterval(id);
    }, [active]);

    if (active.tier === "none") {
        return <NoTierScreen has_polar_error={false} />;
    }

    // These should always be defined when status !== "none", but provide fallbacks for type safety
    const displayName = active.displayName || "Unknown Tier";
    const displayPollen = active.subscriptionDetails?.dailyPollen ?? 0;

    return (
        <TierScreen
            tier={active.tier}
            countdown={countdown}
            active_tier_name={displayName}
            daily_pollen={displayPollen}
            subscription_canceled_at={active.subscriptionDetails?.canceledAt}
            subscription_ends_at={active.subscriptionDetails?.endsAt}
        />
    );
};

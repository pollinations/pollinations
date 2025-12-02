import { useEffect, useState, type FC } from "react";
import { TierExplanation } from "./tier-explanation";

type TierStatus = "none" | "spore" | "seed" | "flower" | "nectar" | "router";

interface TierPanelProps {
    status: TierStatus;
    next_refill_at_utc: string;
    active_tier_name?: string;
    daily_pollen?: number;
    subscription_status?: string;
    subscription_ends_at?: string;
    subscription_canceled_at?: string;
    has_polar_error?: boolean;
}

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
    <p className="text-xs text-purple-700 bg-gradient-to-r from-purple-50/80 to-indigo-50/80 border border-purple-200/50 rounded-lg px-3 py-2 mt-3">
        ✨ <strong>We're in beta!</strong> We're learning what works best for
        our community and may adjust pollen values and tier rules as we go.
        Thanks for being part of the journey!
    </p>
);

function formatCountdown(targetUTC: string): string {
    const diff = new Date(targetUTC).getTime() - Date.now();
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
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-900 leading-relaxed">
                        ⭕ <strong>No Active Subscription:</strong> You don't
                        have an active tier subscription yet.
                        <br />
                        Click the <strong>Activate Tier</strong> button above to
                        get started.
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
    const endsAt = subscription_ends_at
        ? new Date(subscription_ends_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
          })
        : "";

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
                    className={`inline-flex items-center px-3 py-1 rounded-full font-semibold text-sm ${isCanceled ? "bg-red-50 border border-red-200 text-red-900" : "bg-blue-100 border border-blue-300 text-blue-800"}`}
                >
                    ⏱️ {countdown}
                </span>
            </div>

            {isCanceled ? (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-900 leading-relaxed">
                        🔔 <strong>Subscription Ending:</strong> Your
                        subscription is active until <strong>{endsAt}</strong>.
                        It will not auto-renew. Unused pollen does not carry
                        over.
                    </p>
                </div>
            ) : (
                <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-900 leading-relaxed">
                        ✓ Your subscription is active and will earn you{" "}
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

export const TierPanel: FC<TierPanelProps> = ({
    status,
    next_refill_at_utc,
    active_tier_name,
    daily_pollen,
    subscription_canceled_at,
    subscription_ends_at,
    has_polar_error,
}) => {
    // Hooks must be called before any conditional returns
    const [countdown, setCountdown] = useState<string>(
        formatCountdown(next_refill_at_utc),
    );

    useEffect(() => {
        const id = setInterval(() => {
            setCountdown(formatCountdown(next_refill_at_utc));
        }, 60000);
        return () => clearInterval(id);
    }, [next_refill_at_utc]);

    if (status === "none") {
        return <NoTierScreen has_polar_error={has_polar_error} />;
    }

    // These should always be defined when status !== "none", but provide fallbacks for type safety
    const displayName = active_tier_name || "Unknown Tier";
    const displayPollen = daily_pollen ?? 0;

    return (
        <TierScreen
            tier={status}
            countdown={countdown}
            active_tier_name={displayName}
            daily_pollen={displayPollen}
            subscription_canceled_at={subscription_canceled_at}
            subscription_ends_at={subscription_ends_at}
        />
    );
};

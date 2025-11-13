import { useEffect, useState, type FC } from "react";

type TierStatus = "none" | "seed" | "flower" | "nectar";

interface TierPanelProps {
    status: TierStatus;
    assigned_tier: TierStatus;
    next_refill_at_utc: string;
    product_name?: string;
    daily_pollen?: number;
    subscription_status?: string;
    subscription_ends_at?: string;
    subscription_canceled_at?: string;
}

// Badge colors for each tier level
const TIER_BADGE_COLORS: Record<TierStatus, string> = {
    none: "bg-gray-100 border border-gray-400 text-gray-800",
    seed: "bg-emerald-100 border border-emerald-400 text-emerald-800",
    flower: "bg-fuchsia-100 border border-fuchsia-400 text-fuchsia-800",
    nectar: "bg-amber-100 border border-amber-400 text-amber-800",
};

const TIER_ORDER = ["seed", "flower", "nectar"] as const;

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatCountdown(targetUTC: string): string {
    const diff = new Date(targetUTC).getTime() - Date.now();
    if (diff <= 0) return "0h 0m";
    
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
}

const NoTierScreen: FC = () => {
    return (
        <div className="rounded-2xl p-6 border-2 border-gray-300 bg-gray-50/30">
            <div className="flex flex-col gap-3">
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-900 leading-relaxed">
                        ⭕ <strong>No Active Subscription:</strong> You don't have an active tier subscription yet.
                        <br />
                        Click the <strong>Activate Tier</strong> button above to get started.
                    </p>
                </div>
                
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-900 leading-relaxed">
                        ⚠️ <strong>Beta Notice:</strong> Daily pollen amounts are experimental values that may change at any time without notice. Tier subscription benefits are not yet finalized.
                    </p>
                </div>
            </div>
        </div>
    );
};

const TierScreen: FC<{
    tier: TierStatus;
    assigned_tier: TierStatus;
    countdown: string;
    product_name: string;
    daily_pollen: number;
    subscription_canceled_at?: string;
    subscription_ends_at?: string;
}> = ({
    tier,
    assigned_tier,
    countdown,
    product_name,
    daily_pollen,
    subscription_canceled_at,
    subscription_ends_at,
}) => {
    const badgeColors = TIER_BADGE_COLORS[tier];

    // Detect cancellation
    const isCanceled = !!subscription_canceled_at && !!subscription_ends_at;
    const endsAt = subscription_ends_at ? new Date(subscription_ends_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : "";

    return (
        <div className="rounded-2xl p-6 border-2 border-gray-300 bg-gray-50/30">
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-3xl font-bold text-gray-900">
                        {product_name}
                    </span>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full font-semibold text-sm ${badgeColors}`}>
                        {daily_pollen} pollen/day
                    </span>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full font-semibold text-sm ${isCanceled ? 'bg-red-50 border border-red-200 text-red-900' : 'bg-blue-100 border border-blue-300 text-blue-800'}`}>
                        ⏱️ {countdown}
                    </span>
                </div>

                {isCanceled ? (
                    <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-900 leading-relaxed">
                            🔔 <strong>Subscription Ending:</strong> Your subscription is active until <strong>{endsAt}</strong>. It will not auto-renew.
                            <br />
                            Unused pollen does not carry over.
                        </p>
                    </div>
                ) : (
                    <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm text-green-900 leading-relaxed">
                            ✓ <strong>Active Subscription:</strong> Your subscription is active and will earn you {daily_pollen} pollen daily.
                            <br />
                            Unused pollen does not carry over.
                        </p>
                    </div>
                )}
                
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-900 leading-relaxed">
                        ⚠️ <strong>Beta Notice:</strong> Daily pollen amounts are experimental values that may change at any time without notice. Tier subscription benefits are not yet finalized.
                    </p>
                </div>
            </div>
        </div>
    );
};

export const TierPanel: FC<TierPanelProps> = ({
    status,
    assigned_tier,
    next_refill_at_utc,
    product_name,
    daily_pollen,
    subscription_canceled_at,
    subscription_ends_at,
}) => {
    if (status === "none") {
        return <NoTierScreen />;
    }

    // These should always be defined when status !== "none", but provide fallbacks for type safety
    const displayName = product_name || "Unknown Tier";
    const displayPollen = daily_pollen ?? 0;

    const [countdown, setCountdown] = useState<string>(formatCountdown(next_refill_at_utc));

    useEffect(() => {
        const id = setInterval(() => {
            setCountdown(formatCountdown(next_refill_at_utc));
        }, 60000);
        return () => clearInterval(id);
    }, [next_refill_at_utc]);

    return (
        <TierScreen 
            tier={status}
            assigned_tier={assigned_tier}
            countdown={countdown}
            product_name={displayName}
            daily_pollen={displayPollen}
            subscription_canceled_at={subscription_canceled_at}
            subscription_ends_at={subscription_ends_at}
        />
    );
};

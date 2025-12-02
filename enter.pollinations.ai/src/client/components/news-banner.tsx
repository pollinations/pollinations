import { useState, useEffect, type FC } from "react";

const NEWS_ID = "dec-2025-pollen-rebalance";

export const NewsBanner: FC = () => {
    const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash

    useEffect(() => {
        const isDismissed = localStorage.getItem(`news-dismissed-${NEWS_ID}`);
        setDismissed(isDismissed === "true");
    }, []);

    const handleDismiss = () => {
        localStorage.setItem(`news-dismissed-${NEWS_ID}`, "true");
        setDismissed(true);
    };

    if (dismissed) return null;

    return (
        <div className="relative bg-gradient-to-r from-purple-50 to-amber-50 border border-purple-200/50 rounded-lg p-4 text-sm">
            <button
                type="button"
                onClick={handleDismiss}
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                aria-label="Dismiss"
            >
                ×
            </button>

            <div className="flex flex-col gap-3 pr-6">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                        dec 2025
                    </span>
                    <span className="text-gray-500 text-xs">
                        pollen rebalance
                    </span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-gray-600">
                    <span>🦠 spore 1/day</span>
                    <span>🌱 seed 3/day</span>
                    <span>🌸 flower 10/day</span>
                    <span>🍯 nectar 20/day</span>
                </div>

                <div className="text-xs text-gray-500">
                    <span className="text-purple-600">new:</span> claude opus
                    4.5 · kimi k2 · seedream 4 · veo 3.1 · seedance
                </div>
            </div>
        </div>
    );
};

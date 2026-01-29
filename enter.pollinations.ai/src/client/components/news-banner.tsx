import type { FC } from "react";

// Set to true when there's a special announcement to show
const SHOW_BANNER = true;

/**
 * News/announcement banner - hidden by default.
 * To show: set SHOW_BANNER = true and update the content below.
 */
export const NewsBanner: FC = () => {
    if (!SHOW_BANNER) return null;

    return (
        <div className="bg-violet-50/60 border border-violet-200 rounded-lg p-4 text-sm">
            <div className="flex flex-col gap-2">
                <span className="text-xs text-gray-500">
                    Jan 2026 — What's new
                </span>
                <ul className="text-xs space-y-1.5">
                    <li className="text-gray-600">
                        💎 <strong>Paid-only models:</strong> claude-large, gemini-large, veo, seedream-pro, nanobanana-pro now require purchased pollen
                    </li>
                    <li className="text-gray-600">
                        🆕 <strong>Kimi K2.5 thinking:</strong> Rivals Claude Opus at ~1/8th the cost
                    </li>
                    <li className="text-gray-600">
                        � <strong>New payment methods:</strong> PayPal, Apple Pay, Google Pay via Stripe
                    </li>
                </ul>
            </div>
        </div>
    );
};

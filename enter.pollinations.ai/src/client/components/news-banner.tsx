import type { FC } from "react";

// Set to true when there's a special announcement to show
const SHOW_BANNER = false;

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
                    Dec 2025 — What's new
                </span>
                <ul className="text-xs space-y-1.5">
                    <li className="text-gray-600">
                        🎉 <strong>Tier values updated</strong>{" "}
                        <span className="text-gray-400 italic">dec 1</span>
                    </li>
                    <li className="text-gray-600">
                        🚀 <strong>Fresh models dropped:</strong> Claude Opus
                        4.5, Kimi K2, Seedream 4.5, VEO 3.1, Seedance Pro-Fast
                    </li>
                </ul>
            </div>
        </div>
    );
};

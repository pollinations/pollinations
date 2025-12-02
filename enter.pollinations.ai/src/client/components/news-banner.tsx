import { useState, useEffect, type FC } from "react";

const NEWS_ID = "dec-2025-v3";

export const NewsBanner: FC = () => {
    const [dismissed, setDismissed] = useState(true);

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
        <div className="relative bg-white/60 border border-gray-200 rounded-lg p-4 text-sm">
            <button
                type="button"
                onClick={handleDismiss}
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                aria-label="Dismiss"
            >
                ×
            </button>

            <div className="flex flex-col gap-2 pr-6">
                <span className="text-xs text-gray-500">
                    Dec 2025 — What's new
                </span>
                <ul className="text-xs space-y-1.5">
                    <li className="text-gray-600">
                        🎉 <strong>Tier values updated</strong>{" "}
                        <span className="text-gray-400 italic">dec 1</span>
                    </li>
                    <li className="text-gray-600">
                        🚀 <strong>Fresh models dropped:</strong>{" "}
                        <span className="text-gray-700">Claude Opus 4.5</span> ·{" "}
                        <span className="text-gray-700">Kimi K2</span> ·{" "}
                        <span className="text-gray-700">Seedream 4</span> ·{" "}
                        <span className="text-gray-700">VEO 3.1</span> ·{" "}
                        <span className="text-gray-700">Seedance</span>
                    </li>
                    <li className="text-gray-600">
                        🔧 <em>Tier automation</em> —{" "}
                        <span className="text-gray-500">cooking...</span>
                    </li>
                </ul>
            </div>
        </div>
    );
};

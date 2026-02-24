import type { FC } from "react";

const SCORING_URL =
    "https://github.com/pollinations/pollinations/blob/main/TIER_SCORING.md";

// Color mappings for backgrounds and text (100, 300, 700, 900 shades)
const COLOR_CLASSES = {
    amber: {
        bg100: "bg-amber-100",
        bg300: "bg-amber-300",
        text700: "text-amber-700",
        text900: "text-amber-900",
        hoverText900: "hover:text-amber-900",
    },
    green: {
        bg100: "bg-green-100",
        bg300: "bg-green-300",
        text700: "text-green-700",
        text900: "text-green-900",
        hoverText900: "hover:text-green-900",
    },
    pink: {
        bg100: "bg-pink-100",
        bg300: "bg-pink-300",
        text700: "text-pink-700",
        text900: "text-pink-900",
        hoverText900: "hover:text-pink-900",
    },
    blue: {
        bg100: "bg-blue-100",
        bg300: "bg-blue-300",
        text700: "text-blue-700",
        text900: "text-blue-900",
        hoverText900: "hover:text-blue-900",
    },
    gray: {
        bg100: "bg-gray-100",
        bg300: "bg-gray-300",
        text700: "text-gray-700",
        text900: "text-gray-900",
        hoverText900: "hover:text-gray-900",
    },
} as const;

type ColorKey = keyof typeof COLOR_CLASSES;

export const LevelUpCards: FC<{ color?: ColorKey }> = ({ color = "amber" }) => {
    const colors = COLOR_CLASSES[color];
    return (
        <div>
            <p className="text-sm text-gray-900 leading-relaxed mb-3">
                📈 Your score is calculated dynamically based on your activity
                across the ecosystem.
            </p>
            <div className="flex text-xs gap-3">
                <div className="flex flex-1">
                    <div className="flex-1">
                        <div className="font-bold text-gray-900 uppercase tracking-wide mb-2">
                            Contribute
                        </div>
                        <div className="space-y-1.5 text-gray-500">
                            <div>💻 Push code on GitHub</div>
                            <div>📝 Improve docs</div>
                            <div>💬 Help in Discord</div>
                            <div>🐛 Report &amp; fix bugs</div>
                        </div>
                    </div>
                    <div className={`w-px ${colors.bg300} mx-4 self-stretch`} />
                    <div className="flex-1">
                        <div className="font-bold text-gray-900 uppercase tracking-wide mb-2">
                            Grow the Economy
                        </div>
                        <div className="space-y-1.5 text-gray-500">
                            <div>📦 Publish an app</div>
                            <div>🔌 Integrate BYOP</div>
                            <div>📊 Drive real usage</div>
                            <div>🌼 Buy Pollen</div>
                        </div>
                    </div>
                </div>
                <div
                    className={`flex-[0.7] ${colors.bg100} rounded-lg px-3 py-2 self-stretch`}
                >
                    <div
                        className={`font-bold ${colors.text700} uppercase tracking-wide mb-2`}
                    >
                        We're in Beta!
                    </div>
                    <div className={colors.text700}>
                        🧪 Scores and tiers may evolve as we learn what works
                        best.
                    </div>
                    <div className={`mt-2 space-y-1 ${colors.text700}`}>
                        <div>
                            <a
                                href={SCORING_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`underline ${colors.hoverText900}`}
                            >
                                See full scoring rules &rarr;
                            </a>
                        </div>
                        <div>
                            <a
                                href="#what-are-tiers"
                                className={`underline ${colors.hoverText900}`}
                            >
                                How do tiers work? &rarr;
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

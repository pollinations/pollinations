import type { FC } from "react";

const SCORING_URL =
    "https://github.com/pollinations/pollinations/blob/main/TIER_SCORING.md";

export const LevelUpCards: FC = () => (
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
                <div className="w-px bg-amber-300 mx-4 self-stretch" />
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
            <div className="flex-[0.7] bg-amber-100 rounded-lg px-3 py-2 self-stretch">
                <div className="font-bold text-amber-700 uppercase tracking-wide mb-2">
                    We're in Beta!
                </div>
                <div className="text-amber-700">
                    🧪 Scores and tiers may evolve as we learn what works best.
                </div>
                <div className="mt-2 space-y-1 text-amber-700">
                    <div>
                        <a
                            href={SCORING_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-amber-900"
                        >
                            See full scoring rules &rarr;
                        </a>
                    </div>
                    <div>
                        <a
                            href="#what-are-tiers"
                            className="underline hover:text-amber-900"
                        >
                            How do tiers work? &rarr;
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

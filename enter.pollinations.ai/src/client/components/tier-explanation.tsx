import type { FC } from "react";

export const TierExplanation: FC = () => {
    const tierBoxStyle = "rounded-lg p-3 border border-gray-200 bg-gray-50/30";

    return (
        <div className="px-3 py-2 border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-900 leading-relaxed mb-3">
                📈 <strong>Grow Your Tier:</strong> For developers building with
                Pollinations. Level up to earn more daily pollen.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Spore */}
                <div className={tierBoxStyle}>
                    <div className="flex items-center gap-1.5">
                        <span>🦠</span>
                        <strong className="text-gray-800 text-sm">Spore</strong>
                    </div>
                    <p className="text-xs font-mono text-gray-600 mt-1">
                        1 pollen/day
                    </p>
                    <p className="text-xs text-gray-500 mt-1.5 border-t border-gray-200 pt-1.5">
                        → Just germinated
                    </p>
                </div>

                {/* Seed */}
                <div className={tierBoxStyle}>
                    <div className="flex items-center gap-1.5">
                        <span>🌱</span>
                        <strong className="text-gray-800 text-sm">Seed</strong>
                    </div>
                    <p className="text-xs font-mono text-gray-600 mt-1">
                        3 pollen/day
                    </p>
                    <p className="text-xs text-gray-500 mt-1.5 border-t border-gray-200 pt-1.5">
                        → Active on GitHub
                    </p>
                </div>

                {/* Flower */}
                <div className={tierBoxStyle}>
                    <div className="flex items-center gap-1.5">
                        <span>🌸</span>
                        <strong className="text-gray-800 text-sm">
                            Flower
                        </strong>
                    </div>
                    <p className="text-xs font-mono text-gray-600 mt-1">
                        10 pollen/day
                    </p>
                    <div className="text-xs text-gray-500 mt-1.5 border-t border-gray-200 pt-1.5">
                        <p>→ Featured App</p>
                        <p className="text-gray-400">or</p>
                        <p>→ Merged PR</p>
                    </div>
                </div>

                {/* Nectar */}
                <div className={tierBoxStyle}>
                    <div className="flex items-center gap-1.5">
                        <span>🍯</span>
                        <strong className="text-gray-800 text-sm">
                            Nectar
                        </strong>
                        <span className="text-[10px] text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full font-medium">
                            soon 🔮
                        </span>
                    </div>
                    <p className="text-xs font-mono text-gray-600 mt-1">
                        20 pollen/day
                    </p>
                    <p className="text-xs text-gray-500 mt-1.5 border-t border-gray-200 pt-1.5">
                        → Pollinating the ecosystem
                    </p>
                </div>
            </div>
        </div>
    );
};

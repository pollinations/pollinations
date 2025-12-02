import type { FC } from "react";

export const TierExplanation: FC = () => {
    const tierBoxStyle = "rounded-lg p-3 border border-gray-200";

    return (
        <div className="px-3 py-2 border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-900 leading-relaxed mb-3">
                📈 <strong>Grow Your Tier:</strong> For developers building with
                Pollinations. Level up to earn more daily pollen.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {/* Spore */}
                <div className={tierBoxStyle}>
                    <div className="flex items-center gap-1.5">
                        <span>🦠</span>
                        <strong className="text-gray-800 text-sm">Spore</strong>
                    </div>
                    <p className="text-xs font-mono text-gray-600 mt-1">
                        1 pollen/day
                    </p>
                    <p className="text-[11px] text-gray-400 italic mt-1">
                        Just germinated
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
                    <p className="text-[11px] text-gray-400 italic mt-1">
                        Active on GitHub
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
                    <p className="text-[11px] text-gray-400 italic mt-1">
                        <a
                            href="https://github.com/pollinations/pollinations/issues/new?template=project-submission.yml"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:underline"
                        >
                            Featured app
                        </a>{" "}
                        or merged PR
                    </p>
                </div>

                {/* Nectar */}
                <div className={tierBoxStyle}>
                    <div className="flex items-center gap-1.5">
                        <span>🍯</span>
                        <strong className="text-gray-800 text-sm">
                            Nectar
                        </strong>
                        <span className="text-[10px] text-gray-400 italic">
                            soon
                        </span>
                    </div>
                    <p className="text-xs font-mono text-gray-600 mt-1">
                        20 pollen/day
                    </p>
                    <p className="text-[11px] text-gray-400 italic mt-1">
                        Pollinating the ecosystem
                    </p>
                </div>
            </div>
        </div>
    );
};

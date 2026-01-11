import type { FC } from "react";
import { Tooltip } from "./pricing/Tooltip";

const SeedTooltipContent = () => (
    <div className="w-56">
        <p className="font-semibold text-gray-900 mb-2">
            Dev Points (need 10+)
        </p>
        <table className="w-full text-left text-[11px]">
            <tbody>
                <tr className="border-b border-gray-100">
                    <td className="py-1 text-gray-600">Account age</td>
                    <td className="py-1 text-right text-gray-800">
                        0.5pt/month (max 8)
                    </td>
                </tr>
                <tr className="border-b border-gray-100">
                    <td className="py-1 text-gray-600">Commits</td>
                    <td className="py-1 text-right text-gray-800">
                        0.1pt each (max 1)
                    </td>
                </tr>
                <tr className="border-b border-gray-100">
                    <td className="py-1 text-gray-600">Public repos</td>
                    <td className="py-1 text-right text-gray-800">
                        0.5pt each (max 1)
                    </td>
                </tr>
                <tr>
                    <td className="py-1 text-gray-600">GitHub stars</td>
                    <td className="py-1 text-right text-gray-800">
                        0.1pt each (max 2)
                    </td>
                </tr>
            </tbody>
        </table>
        <p className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-500">
            Evaluated daily. No action needed.
        </p>
    </div>
);

export const TierExplanation: FC = () => {
    const tierBoxStyle = "rounded-lg p-3 border border-gray-200 bg-gray-50/30";
    const requirementLabelStyle =
        "text-[9px] font-semibold text-gray-400 uppercase tracking-wide";

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
                    <div className="mt-1.5 border-t border-gray-200 pt-1.5">
                        <p className={requirementLabelStyle}>To unlock</p>
                        <p className="text-xs text-gray-500">Sign up</p>
                    </div>
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
                    <div className="mt-1.5 border-t border-gray-200 pt-1.5">
                        <p className={requirementLabelStyle}>To unlock</p>
                        <p className="text-xs text-gray-500">
                            <Tooltip content={<SeedTooltipContent />}>
                                <span className="underline decoration-dotted cursor-help">
                                    10+ dev points
                                </span>
                            </Tooltip>
                        </p>
                        <p className="text-[10px] text-emerald-600 mt-0.5">
                            Auto-upgraded daily
                        </p>
                    </div>
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
                    <div className="mt-1.5 border-t border-gray-200 pt-1.5">
                        <p className={requirementLabelStyle}>To unlock</p>
                        <p className="text-xs text-gray-500">
                            <a
                                href="https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml"
                                className="text-blue-600 hover:underline"
                            >
                                Publish an app
                            </a>
                        </p>
                        <p className="text-[10px] text-gray-400">
                            or contribute to the ecosystem
                        </p>
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
                    <div className="mt-1.5 border-t border-gray-200 pt-1.5">
                        <p className={requirementLabelStyle}>To unlock</p>
                        <p className="text-xs text-gray-500">
                            Pollinating the ecosystem
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

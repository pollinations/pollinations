import type { FC } from "react";

export const LevelUpCards: FC = () => (
    <div>
        <p className="text-sm text-gray-900 leading-relaxed mb-3">
            📈 Your score is recalculated daily based on your activity across
            the ecosystem.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
            <div className="rounded-lg p-3 bg-teal-100/60">
                <strong className="text-gray-800 text-sm">Contribute</strong>
                <ul className="text-xs text-gray-600 mt-1.5 space-y-1 list-disc list-inside">
                    <li>Push code on GitHub</li>
                    <li>Improve docs</li>
                    <li>Help in Discord</li>
                    <li>Report &amp; fix bugs</li>
                </ul>
            </div>
            <div className="rounded-lg p-3 bg-amber-100/60">
                <strong className="text-gray-800 text-sm">
                    Grow the economy
                </strong>
                <ul className="text-xs text-gray-600 mt-1.5 space-y-1 list-disc list-inside">
                    <li>Publish an app</li>
                    <li>Integrate BYOP</li>
                    <li>Drive real usage</li>
                    <li>Buy Pollen</li>
                </ul>
            </div>
        </div>
    </div>
);

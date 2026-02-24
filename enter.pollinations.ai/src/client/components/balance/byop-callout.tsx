import type { FC } from "react";

const BYOP_DOCS =
    "https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md";

export const BYOPCallout: FC = () => (
    <div>
        <p className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
            🔌 Bring Your Own Pollen
        </p>
        <p className="text-xs text-gray-500 leading-relaxed">
            Your users pay for their own compute. Your grants stay untouched.
        </p>
        <p className="text-xs text-gray-500 mt-3">
            <a
                href={BYOP_DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-700"
            >
                Set up BYOP &rarr;
            </a>
        </p>
    </div>
);

import type { FC } from "react";

const BYOP_DOCS =
    "https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md";

export const BYOPCallout: FC = () => (
    <div>
        <p className="text-sm font-medium text-gray-900">
            🔌 <strong>Bring Your Own Pollen:</strong> Your users can pay for
            their own compute. Your grants stay untouched.
        </p>
        <p className="text-sm text-gray-500 mt-1">
            <a
                href={BYOP_DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-700"
            >
                Learn how to set up BYOP &rarr;
            </a>
        </p>
    </div>
);

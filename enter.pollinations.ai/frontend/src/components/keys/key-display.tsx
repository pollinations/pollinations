import { CopyField } from "@pollinations/ui";
import type { FC } from "react";

export const KeyDisplay: FC<{ fullKey: string; start: string }> = ({
    fullKey,
    start,
}) => (
    <CopyField
        value={fullKey}
        label="Copy full API key"
        display={`${start}…`}
        className="polli:inline-flex polli:w-auto polli:min-h-7 polli:py-1"
    />
);

import { Chip, Tooltip } from "@pollinations/ui";
import type { FC } from "react";

type ModelStatusChipsProps = {
    showNew: boolean;
    showAlpha: boolean;
    showStable?: boolean;
    alphaTooltip?: boolean;
};

export const ModelStatusChips: FC<ModelStatusChipsProps> = ({
    showNew,
    showAlpha,
    showStable = false,
    alphaTooltip = true,
}) => {
    if (!showNew && !showAlpha && !showStable) {
        return null;
    }

    return (
        <span className="inline-flex shrink-0 items-center gap-1.5">
            {showNew && (
                <Chip intent="news" size="sm">
                    NEW
                </Chip>
            )}
            {showAlpha &&
                (alphaTooltip ? (
                    <Tooltip
                        triggerAs="span"
                        content="Alpha model — experimental, may be unstable"
                    >
                        <Chip intent="alpha" size="sm">
                            ALPHA
                        </Chip>
                    </Tooltip>
                ) : (
                    <Chip intent="alpha" size="sm">
                        ALPHA
                    </Chip>
                ))}
            {showStable && (
                <Tooltip
                    triggerAs="span"
                    content="Community model group — backed by multiple providers for higher reliability"
                >
                    <Chip intent="stable" size="sm">
                        STABLE
                    </Chip>
                </Tooltip>
            )}
        </span>
    );
};

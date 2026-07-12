import { Chip, Tooltip } from "@pollinations/ui";
import type { FC } from "react";

type ModelStatusChipsProps = {
    showNew: boolean;
    showAlpha: boolean;
    alphaTooltip?: boolean;
};

export const ModelStatusChips: FC<ModelStatusChipsProps> = ({
    showNew,
    showAlpha,
    alphaTooltip = true,
}) => {
    if (!showNew && !showAlpha) {
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
        </span>
    );
};

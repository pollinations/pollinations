import { cn } from "../../lib/cn.ts";
import { getModalityKey, modalityColorVar } from "./themes.ts";

/**
 * A small solid dot in a modality's fixed color. The single-accent way to mark
 * a model's modality (text/image/video/audio/realtime/embedding) without
 * theming the whole control. Renders nothing for an unknown category.
 */
export function ModalityDot({
    modality,
    className,
}: {
    modality: string;
    className?: string;
}) {
    const key = getModalityKey(modality);
    if (!key) return null;
    return (
        <span
            aria-hidden="true"
            className={cn(
                "polli:inline-block polli:size-2 polli:shrink-0 polli:rounded-full",
                className,
            )}
            style={{ backgroundColor: modalityColorVar(key) }}
        />
    );
}

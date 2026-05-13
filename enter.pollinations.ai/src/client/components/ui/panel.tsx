import type { ComponentProps, FC } from "react";
import { cn } from "../../../util.ts";
import { Surface } from "./surface.tsx";

type PanelProps = Omit<ComponentProps<typeof Surface>, "size" | "tone"> & {
    /** Drop padding from `p-6` to `p-4`. */
    compact?: boolean;
};

/** @deprecated Use `<Surface size="panel" tone="tinted" />` directly. Removed in Phase 9. */
export const Panel: FC<PanelProps> = ({ compact, className, ...rest }) => (
    <Surface
        size="panel"
        tone="tinted"
        className={cn(compact ? "p-4" : undefined, className)}
        {...rest}
    />
);

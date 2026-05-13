import type { ComponentProps, FC } from "react";
import { Surface } from "./surface.tsx";

type PanelProps = Omit<ComponentProps<typeof Surface>, "size" | "tone">;

/** @deprecated Use `<Surface size="panel" tone="tinted" />` directly. */
export const Panel: FC<PanelProps> = (props) => (
    <Surface size="panel" tone="tinted" {...props} />
);

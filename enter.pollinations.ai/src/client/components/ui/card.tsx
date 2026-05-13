import type { ComponentProps, FC } from "react";
import { Surface } from "./surface.tsx";

type CardProps = Omit<ComponentProps<typeof Surface>, "size">;

/** @deprecated Use `<Surface size="card" />` directly. Removed in Phase 9. */
export const Card: FC<CardProps> = (props) => (
    <Surface size="card" {...props} />
);

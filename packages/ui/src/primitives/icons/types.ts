import type { ComponentPropsWithoutRef } from "react";

/** Icons inherit color via currentColor and size via className or SVG props. */
export type IconProps = ComponentPropsWithoutRef<"svg">;

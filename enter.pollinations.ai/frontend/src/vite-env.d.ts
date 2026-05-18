/// <reference types="vite/client" />

declare module "*.md" {
    import type { ComponentType } from "react";

    const attributes: Record<string, unknown>;
    const html: string;
    const ReactComponent: ComponentType;

    export { attributes, html, ReactComponent };
}

/// <reference types="vite/client" />

declare module "virtual:docs-preview" {
    const content: { guide: string; operation: string; request: string };
    export default content;
}

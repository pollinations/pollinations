/// <reference types="vite/client" />

declare module "virtual:docs-preview" {
    const content: import("./content.ts").DocsContent;
    export default content;
}

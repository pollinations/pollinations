// Re-export all content APIs from new location

export * from "../copy/content/apps";
export * from "../copy/content/community";
export * from "../copy/content/docs";
export * from "../copy/content/hello";
export * from "../copy/content/play";
export * from "./buildPrompts";
export * from "./guidelines/animator";
// Re-export AI generation utilities
// Note: Copy/translation has moved to /src/copy/
export * from "./guidelines/designer";
export * from "./guidelines/helpers/animator";
export * from "./guidelines/helpers/designer";
export * from "./guidelines/helpers/illustrator";
export * from "./guidelines/illustrator";

/**
 * Markdown renderers, deliberately off the main barrel.
 *
 * Both pull react-markdown and its unified/remark tree (~170 KB). A tsup entry
 * is bundled as a single module, so anything re-exported from `index.ts` is a
 * static dependency of every page that imports anything at all from the
 * package — the bundler cannot split one module across chunks. Behind their
 * own entry, only the routes that render documents pay for them.
 */
export { Markdown, type MarkdownProps } from "./compositions/Markdown.tsx";
export { Prose, type ProseProps } from "./compositions/Prose.tsx";

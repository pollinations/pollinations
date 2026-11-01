// Static CSS for the gen.pollinations.ai Scalar docs surface. Pure
// presentation strings — no logic.

import POLLI_UI_TOKENS_CSS from "../../../packages/ui/src/styles/tokens.css?raw";

export const POLLINATIONS_DOCS_CSS = `
${POLLI_UI_TOKENS_CSS}

/* The dashboard's lockup, a thin rule, then "Docs": the drawer is the only
   header. */
.ph-docs-brand {
    display: flex; align-items: center; gap: 12px; padding: 16px 14px 8px;
    flex-shrink: 0; color: var(--scalar-sidebar-color-1); text-decoration: none;
}
.ph-docs-lockup svg { display: block; height: 20px; width: auto; }
.ph-docs-divider {
    width: 1px; height: 16px; background: var(--scalar-sidebar-border-color);
}
.ph-docs-label {
    font-size: 13px; font-weight: 500; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--scalar-sidebar-color-2);
}
.ph-docs-brand:focus-visible {
    outline: 2px solid var(--polli-color-focus); outline-offset: -2px;
}

.ph-docs-links {
    display: flex; flex-direction: column; gap: 1px; flex-shrink: 0;
    padding: 8px var(--scalar-sidebar-padding, 9px) 12px;
    border-top: 1px solid var(--scalar-sidebar-border-color);
}
.ph-docs-link {
    display: flex; align-items: center; gap: 8px; padding: 6px 8px;
    border-radius: var(--scalar-radius, 6px);
    font-size: var(--scalar-font-size-3, 14px);
    color: var(--scalar-sidebar-color-2); text-decoration: none;
}
.ph-docs-link:hover {
    background: var(--scalar-sidebar-item-hover-background);
    color: var(--scalar-sidebar-item-hover-color, var(--scalar-sidebar-color-1));
}
.ph-docs-link .ph-doc-icon { width: 14px; height: 14px; flex: 0 0 14px; }
.ph-docs-link .ph-docs-link-arrow { margin-left: auto; opacity: 0.6; }
.ph-docs-connected .ph-docs-links { display: none; }
.ph-docs-account { display: none; }
.t-doc__sidebar > .ph-docs-account {
    display: block; flex-shrink: 0; padding: 12px 8px;
    border-top: 1px solid var(--scalar-sidebar-border-color);
}
.ph-docs-account polli-connect { width: 100%; }
.ph-docs-account polli-connect > div { justify-content: flex-start; }
.ph-docs-account polli-connect > div > div {
    width: 100%; max-width: none; padding: 4px 12px 4px 4px;
}
.ph-docs-account button > svg:last-child { margin-left: auto; }
/* Scalar's unlayered reset otherwise overrides the UI's text sizes. */
.ph-docs-account polli-connect > div > div [class~="polli:text-sm"] {
    font-size: 13px; line-height: 18px;
}
.ph-docs-account polli-connect > div > div [class~="polli:text-xs"] {
    font-size: 11px; line-height: 16px;
}

.ph-fab-cluster {
    position: fixed; top: 16px; right: 18px; z-index: 9999;
    display: flex; gap: 8px; align-items: center;
    justify-content: flex-end; max-width: calc(100vw - 36px);
}
/* Keep the shared account control quiet on docs, including its portalled menu. */
.ph-docs-account polli-connect > div > [data-theme="accent"],
.polli-connect-menu {
    --polli-color-bg-active: transparent;
    --polli-color-bg-hover: var(--scalar-background-2);
    --polli-color-text-strong: var(--scalar-color-1);
    --polli-color-text-soft: var(--scalar-color-2);
    --polli-color-text-base: var(--scalar-color-2);
    --polli-color-text-hover: var(--scalar-color-1);
    --polli-color-focus: var(--scalar-color-1);
    --polli-color-surface-menu: var(--scalar-background-1);
}
.polli-connect-menu {
    --polli-color-surface-menu: var(--scalar-background-2);
    --polli-color-bg-hover: var(--scalar-background-3);
    border: 1px solid var(--scalar-border-color);
}
/* Restore the standard UI button's typography and spacing after Scalar's reset. */
.ph-docs-account polli-connect > div > button {
    width: 100%; max-width: 320px;
    padding: 0 16px; border: 1px solid var(--polli-color-text-soft);
    font-size: 14px; line-height: 1.5; font-weight: 500;
}
.ph-docs-account polli-connect :is(img, [role="img"]) {
    width: 28px; height: 28px;
}
/* Bright brand amber with dark text: the page's one primary action, with the
   contrast of Scalar's own "Test Request" button. Both faces share one grid
   cell, so "Copied" never changes the button's width. */
.ph-fab {
    display: inline-grid; height: 38px; padding: 0 16px; border-radius: 999px;
    border: 0; background: var(--polli-color-brand-accent); color: oklch(0.2 0.02 80);
    font: 600 14px/1 var(--scalar-font, system-ui, sans-serif);
    cursor: pointer; transition: filter .15s, transform .1s;
}
.ph-fab:hover { filter: brightness(1.06); }
.ph-fab:active { transform: translateY(1px); }
.ph-fab:focus-visible {
    outline: 2px solid var(--polli-color-brand-accent); outline-offset: 2px;
}
.ph-fab-face {
    grid-area: 1 / 1; display: inline-flex; align-items: center;
    justify-content: center; gap: 8px;
}
.ph-fab-done, .ph-fab.is-copied .ph-fab-idle { visibility: hidden; }
.ph-fab.is-copied .ph-fab-done { visibility: visible; }
.ph-fab svg { width: 16px; height: 16px; }
/* Mobile: sit in Scalar's top bar beside its menu button, clear of the content
   below, and drop the bar's separator line; the copy button keeps only its
   icon on small screens. The account stays inside the drawer. */
@media (width < 1000px) {
    .ph-fab-cluster { top: 9px; right: 12px; }
    .scalar-app header.border-b { border-bottom-width: 0; }
    .scalar-app .t-doc__header > header {
        height: 56px; flex-shrink: 0; padding-right: 170px; gap: 8px;
    }
    .scalar-app .t-doc__header > header > button {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        width: auto; height: 44px; flex-shrink: 0; margin: 0; padding: 0 14px;
        border: 0; border-radius: 999px; aspect-ratio: auto;
        background: var(--polli-color-brand-accent); color: oklch(0.2 0.02 80);
        font: 600 14px/1 var(--scalar-font, system-ui, sans-serif);
    }
    .scalar-app .t-doc__header > header > button svg { width: 20px; height: 20px; }
    .scalar-app .t-doc__header > header > button:hover { filter: brightness(1.06); }
    .scalar-app .t-doc__header > header > button:focus-visible {
        outline: 2px solid var(--polli-color-brand-accent); outline-offset: 2px;
    }
    .scalar-app:not(.references-sidebar-mobile-open) .t-doc__header > header > button::after { content: "Menu"; }
    .scalar-app .t-doc__header > header > span { overflow: hidden; text-overflow: ellipsis; }
    .references-sidebar-mobile-open .t-doc__header > header { height: 0; padding: 0; }
    .references-sidebar-mobile-open .t-doc__header > header > :not(button) { display: none; }
    .references-sidebar-mobile-open .t-doc__header > header > button {
        position: absolute; top: 12px; right: 12px; width: 44px; padding: 0; z-index: 20;
    }
    .references-sidebar-mobile-open .t-doc__header .ph-docs-brand {
        min-height: 68px; padding: 12px 68px 12px 14px; gap: 8px; box-sizing: border-box;
    }
    body:has(.references-sidebar-mobile-open) .ph-fab-cluster { display: none; }
}
@media (max-width: 640px) {
    .ph-fab-cluster { top: 11px; }
    .scalar-app .t-doc__header > header { padding-right: 60px; }
    .ph-fab { height: 34px; padding: 0 12px; font-size: 13px; }
    .ph-fab svg { width: 14px; height: 14px; }
    .ph-fab-copy .ph-fab-face { font-size: 0; gap: 0; }
}
`;

export const API_REFERENCE_CUSTOM_CSS = `
/* Each table gets its own horizontal scroll, scoped to itself, so the
   markdown container doesn't grow a second outer scrollbar that fights
   with the scroll on adjacent code blocks. */
.scalar-app .markdown table {
  display: block;
  max-width: 100%;
  width: max-content;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.scalar-app .markdown table th,
.scalar-app .markdown table td {
  word-break: normal !important;
  overflow-wrap: normal !important;
}

.scalar-app .markdown a {
  color: var(--polli-color-text-soft);
  text-decoration-color: var(--polli-color-border);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
.scalar-app .markdown a:hover {
  color: var(--polli-color-text-strong);
  text-decoration-color: var(--polli-color-text-soft);
}

.ph-doc-nav-icon {
  display: inline-block !important;
  width: 14px !important;
  height: 14px !important;
  min-width: 14px !important;
  min-height: 14px !important;
  max-width: 14px !important;
  max-height: 14px !important;
  margin-right: 7px;
  flex: 0 0 14px !important;
  align-self: center;
  color: var(--polli-color-text-muted);
}
.scalar-app .ph-doc-nav-item:hover .ph-doc-nav-icon,
.scalar-app .ph-doc-nav-item[aria-current="page"] .ph-doc-nav-icon,
.scalar-app .ph-doc-nav-item[aria-current="true"] .ph-doc-nav-icon {
  color: var(--polli-color-text-soft);
}

/* Amber group titles (Get Started, Guides, ...) split the drawer into its
   parts. In Scalar 1.74 the title is the link in each group's first row. */
.scalar-app [data-sidebar-id^="api/tag-group/"] > div:first-child > a {
  color: var(--polli-color-text-soft);
}

/* Hide Scalar's native download UI — we surface it via the floating
   action cluster (see .ph-fab-cluster below) for layout consistency. */
.scalar-app .download-container { display: none !important; }

/* Hide Scalar's SDK/MCP promotion, its "Ask AI Agent" form beside Test
   Request, and the footer attribution. */
.scalar-app .explore-scalar,
.scalar-app .selected-client-action,
.scalar-app .generate-sdk-button,
.scalar-app .agent-button-container { display: none !important; }
.scalar-app a[href*="utm_source=powered-by"] { display: none !important; }

/* Hide Scalar's IDE/MCP quick-launch buttons (VS Code, Cursor, Generate MCP).
   These render in the sidebar regardless of showDeveloperTools. We target
   by URL scheme so the rule survives class-name renames across Scalar
   versions, plus the section wrapper via :has() in case the buttons render
   inside a labeled group. */
.scalar-app a[href^="vscode:"],
.scalar-app a[href^="vscode-insiders:"],
.scalar-app a[href^="cursor:"],
.scalar-app a[href*="mcp.scalar.com"],
.scalar-app a[href*="generate-mcp"],
.scalar-app a[href*="modelcontextprotocol"],
.scalar-app .scalar-mcp-layer { display: none !important; }
.scalar-app section:has(> a[href^="vscode:"]),
.scalar-app section:has(> a[href^="cursor:"]) { display: none !important; }

/* Hide Scalar's "Ask AI" feature (sidebar button + any floating widget).
   Targeted by attribute and class fragments, case-insensitive, since the
   CDN bundle may rename the underlying classes between releases. */
.scalar-app [class*="ask-ai" i],
.scalar-app [class*="askai" i],
.scalar-app [class*="ai-assistant" i],
.scalar-app [aria-label*="Ask AI" i],
.scalar-app [title*="Ask AI" i],
.scalar-app button[data-feature="ask-ai" i] { display: none !important; }

/* Full-width prose for sections with no right-column code samples (Quick Start,
   Auth, BYOP, CLI, MCP, Errors, Safety, plain Models/Account). Scalar lays
   each tag out as two flex columns; the right column stays empty for prose-
   only tags, wasting ~50% of the page. We collapse the empty column and let
   the prose stretch. The same rule fixes the section header row above. */
.scalar-app .section-columns:has(> .section-column:nth-child(2):empty) > .section-column:first-child {
    flex: 1 1 100% !important;
    max-width: 100% !important;
}
.scalar-app .section-columns > .section-column:nth-child(2):empty {
    display: none !important;
}
.scalar-app .section-header-wrapper:not(:has(> :nth-child(2))) {
    grid-template-columns: 1fr !important;
}

/* Keep section expansion quiet and aligned with the content. */
.scalar-app .ph-show-more {
    margin-inline: 0 auto;
    background: var(--scalar-background-2);
    color: var(--scalar-color-2);
}
.scalar-app .ph-show-more:hover {
    background: var(--scalar-background-3);
    color: var(--scalar-color-1);
}
`;

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

/* Dashboard, account and help links: Scalar's own row colours, so they read
   like the rest of the drawer; the arrow says they open another site. */
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

.ph-fab-cluster {
    position: fixed; top: 16px; right: 18px; z-index: 9999;
    display: flex; gap: 8px; align-items: center;
    justify-content: flex-end; max-width: calc(100vw - 36px);
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
@media (width < 1000px) {
    .ph-fab-cluster { top: 60px; right: 12px; }
    body:has(.references-sidebar-mobile-open) .ph-fab-cluster { display: none; }
}
@media (max-width: 640px) {
    .ph-fab { height: 34px; padding: 0 12px; font-size: 13px; }
    .ph-fab svg { width: 14px; height: 14px; }
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

/* Hide Scalar's native download UI — we surface it via the floating
   action cluster (see .ph-fab-cluster below) for layout consistency. */
.scalar-app .download-container { display: none !important; }

/* Hide Scalar's SDK/MCP promotion and footer attribution. */
.scalar-app .explore-scalar,
.scalar-app .selected-client-action,
.scalar-app .generate-sdk-button { display: none !important; }
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

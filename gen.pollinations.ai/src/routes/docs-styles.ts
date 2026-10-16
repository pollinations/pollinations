// Static CSS for the gen.pollinations.ai Scalar docs surface. Pure
// presentation strings — no logic.

import POLLI_UI_TOKENS_CSS from "../../../packages/ui/src/styles/tokens.css?raw";

export const POLLINATIONS_DOCS_CSS = `
${POLLI_UI_TOKENS_CSS}

.ph-docs-brand {
    display: flex; align-items: center; gap: 10px; padding: 12px;
    flex-shrink: 0; font-size: 18px; font-weight: 600;
    color: var(--polli-color-text-strong); text-decoration: none;
}
.ph-docs-brand svg { display: block; width: 28px; height: 28px; }
.ph-docs-brand:focus-visible {
    outline: 2px solid var(--polli-color-focus); outline-offset: -2px;
}

.ph-fab-cluster {
    position: fixed; top: 16px; right: 18px; z-index: 9999;
    display: flex; gap: 8px; align-items: center;
    justify-content: flex-end; max-width: calc(100vw - 36px);
}
.ph-fab {
    padding: 10px 14px; border-radius: 999px;
    border: 0; background: var(--polli-color-bg-active); color: var(--polli-color-text-strong);
    font: 500 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    box-shadow: none;
    cursor: pointer; text-decoration: none;
    transition: background .15s, color .15s, filter .15s, transform .1s;
    display: inline-flex; align-items: center; gap: 6px; line-height: 1;
}
.ph-fab:hover {
    background: var(--polli-color-bg-hover); color: var(--polli-color-text-strong);
    filter: brightness(1.05);
}
.ph-fab:active { transform: translateY(1px); }
.ph-fab:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--polli-color-border);
}
.ph-fab svg { width: 16px; height: 16px; }
@media (width < 1000px) {
    .ph-fab-cluster { top: 60px; right: 12px; }
    body:has(.references-sidebar-mobile-open) .ph-fab-cluster { display: none; }
}
@media (max-width: 640px) {
    .ph-fab { padding: 7px 11px; font-size: 12px; }
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

.scalar-app .ph-doc-nav-item {
  align-items: center;
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

/* Make each drawer section easy to scan. Scalar renders section labels as
   tag-group rows and inserts a small spacer immediately before each one. */
.scalar-app [data-sidebar-id^="api/tag-group/"] > div:first-child {
  height: 12px !important;
  min-height: 12px !important;
  flex-shrink: 0;
}
.scalar-app [data-sidebar-id^="api/tag-group/"] > div:nth-child(2) {
  color: var(--polli-color-text-soft) !important;
}

/* Hide Scalar's native download UI — we surface it via the floating
   action cluster (see .ph-fab-cluster below) for layout consistency. */
.scalar-app .download-container { display: none !important; }

/* Hide "Powered by Scalar" sidebar footer link. */
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

/* "Show more" buttons (tagged by our docs script — see scanScalarButtons).
   Use the same ambient Button recipe as packages/ui. */
.scalar-app .ph-show-more {
    background: var(--polli-color-bg-active) !important;
    color: var(--polli-color-text-strong) !important;
    border-color: var(--polli-color-bg-active) !important;
}
.scalar-app .ph-show-more:hover {
    background: var(--polli-color-bg-hover) !important;
    border-color: var(--polli-color-bg-hover) !important;
}
/* Force the chevron/triangle SVG inside the button to match text color
   (otherwise it inherits Scalar's dim color and disappears on amber). */
.scalar-app .ph-show-more svg,
.scalar-app .ph-show-more svg * {
    color: var(--polli-color-text-strong) !important;
    fill: currentColor !important;
    stroke: currentColor !important;
}
`;

// Static CSS for the gen.pollinations.ai docs surface: the Pollinations
// header bar, the Scalar API-reference overrides, and the standalone
// guides pages. Pure presentation strings — no logic.

export const POLLINATIONS_HEADER_CSS = `
.ph-bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483000;
    min-height: 48px; box-sizing: border-box;
    background: #0a0a0a; border-bottom: 1px solid #1f1f23;
    display: flex; align-items: center; gap: 10px; padding: 8px 14px;
    font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #d4d4d8;
}
.ph-bar .ph-brand {
    color: #fafafa; text-decoration: none;
    display: inline-flex; align-items: center; flex-shrink: 0;
}
.ph-bar .ph-brand img { height: 18px; width: auto; display: block; }
@media (min-width: 640px) { .ph-bar .ph-brand img { height: 20px; } }
@media (max-width: 640px) {
    .ph-bar { justify-content: center; padding: 8px 12px; }
    .ph-bar .ph-brand img { height: 22px; }
}

.ph-fab-cluster {
    position: fixed; top: 64px; right: 18px; z-index: 9999;
    display: flex; gap: 8px; align-items: center;
    justify-content: flex-end; max-width: calc(100vw - 36px);
}
.ph-fab {
    padding: 10px 14px; border-radius: 999px;
    border: 1px solid #f59e0b; background: #f59e0b; color: #451a03;
    font: 600 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    box-shadow: 0 6px 20px rgba(245,158,11,.3);
    cursor: pointer; text-decoration: none;
    transition: background .15s, color .15s, box-shadow .15s, transform .1s;
    display: inline-flex; align-items: center; gap: 6px; line-height: 1;
}
.ph-fab:hover {
    background: #0a0a0a; color: #f59e0b;
    box-shadow: 0 6px 24px rgba(245,158,11,.4);
}
.ph-fab:active { transform: translateY(1px); }
.ph-fab svg { width: 16px; height: 16px; }
@media (max-width: 640px) {
    .ph-fab-cluster { top: 60px; right: 12px; }
    .ph-fab { padding: 7px 11px; font-size: 12px; }
    .ph-fab svg { width: 14px; height: 14px; }
}
`;

export const POLLINATIONS_HEADER_SCALAR_CSS = `
/* Push Scalar's mount point down so its content (h1, version badges,
   sidebar, mobile hamburger row) doesn't render under our fixed bar.
   Body padding works because .ph-bar is position: fixed — it ignores
   parent padding, so the bar stays at top while everything else shifts. */
body { padding-top: 48px; }
/* Match Scalar's mobile hamburger row background to our bar so the seam
   between the two reads as one continuous header instead of a stripe. */
@media (max-width: 1000px) {
    .scalar-app [class*="lg:hidden"][class*="grid-area:header"] {
        background: #0a0a0a !important;
        border: 0 !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
    }
}
`;

export const POLLINATIONS_HEADER_STANDALONE_CSS = `
body { padding-top: 48px; }
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
  color: #f59e0b;
}
.scalar-app .markdown a:hover {
  color: #fbbf24;
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
  color: var(--scalar-sidebar-color-2);
}
.scalar-app .ph-doc-nav-item:hover .ph-doc-nav-icon,
.scalar-app .ph-doc-nav-item[aria-current="page"] .ph-doc-nav-icon,
.scalar-app .ph-doc-nav-item[aria-current="true"] .ph-doc-nav-icon {
  color: var(--scalar-sidebar-color-active);
}

/* Hide Scalar's native download UI — we surface it via the floating
   action cluster (see .ph-fab-cluster below) for layout consistency. */
.scalar-app .download-container { display: none !important; }

/* Hide "Powered by Scalar" sidebar footer link. */
.scalar-app a[href="https://www.scalar.com"] { display: none !important; }

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
.scalar-app a[href*="modelcontextprotocol"] { display: none !important; }
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

/* "Show more" buttons (tagged by our header script — see scanScalarButtons).
   Promote to the amber action color so they don't disappear into the page. */
.scalar-app .ph-show-more {
    background: #f59e0b !important;
    color: #451a03 !important;
    border-color: #f59e0b !important;
}
.scalar-app .ph-show-more:hover {
    background: #fbbf24 !important;
    border-color: #fbbf24 !important;
}
/* Force the chevron/triangle SVG inside the button to match text color
   (otherwise it inherits Scalar's dim color and disappears on amber). */
.scalar-app .ph-show-more svg,
.scalar-app .ph-show-more svg * {
    color: #451a03 !important;
    fill: currentColor !important;
    stroke: currentColor !important;
}
`;

export const GUIDES_CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { overflow-x: hidden; }
body {
    font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #d4d4d8;
    background: #0a0a0a;
    margin: 0;
}
.wrap { max-width: 800px; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
h1, h2, h3, h4 { font-weight: 600; line-height: 1.3; margin: 2rem 0 .75rem; color: #fafafa; }
h1 { font-size: 1.875rem; margin-top: 1rem; }
h2 { font-size: 1.375rem; padding-bottom: .375rem; border-bottom: 1px solid #27272a; }
h3 { font-size: 1.125rem; }
p, li, blockquote { overflow-wrap: anywhere; word-break: break-word; }
p { margin: .75rem 0; }
code {
    background: #18181b; padding: 2px 5px; border-radius: 4px; color: #f4f4f5;
    font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    overflow-wrap: anywhere; word-break: break-word;
}
pre {
    background: #000; color: #f1f5f9; padding: 1rem; border-radius: 8px;
    border: 1px solid #1f1f23; overflow-x: auto; font-size: 13px; line-height: 1.5;
    max-width: 100%;
}
pre code {
    background: transparent; color: inherit; padding: 0;
    overflow-wrap: normal; word-break: normal; white-space: pre;
}
table {
    display: block; max-width: 100%; width: max-content;
    overflow-x: auto; -webkit-overflow-scrolling: touch;
    border-collapse: collapse; margin: 1rem 0; font-size: .9rem;
}
th, td { padding: .5rem .75rem; border: 1px solid #27272a; text-align: left; vertical-align: top; }
th { background: #18181b; font-weight: 600; color: #fafafa; }
a { color: #f59e0b; text-decoration: none; overflow-wrap: anywhere; word-break: break-word; }
a:hover { text-decoration: underline; }
blockquote { border-left: 3px solid #3f3f46; padding: .25rem 1rem; color: #a1a1aa; margin: 1rem 0; background: #131316; }
ul, ol { padding-left: 1.5rem; }
li { margin: .25rem 0; }
hr { border: 0; border-top: 1px solid #27272a; margin: 2rem 0; }
img { max-width: 100%; height: auto; }
.guide-cards { display: grid; gap: 1rem; grid-template-columns: 1fr; margin-top: 1.5rem; }
@media (min-width: 600px) { .guide-cards { grid-template-columns: 1fr 1fr; } }
.guide-card {
    display: block; padding: 1.25rem; border: 1px solid #27272a; border-radius: 10px;
    background: #131316; color: #fafafa; text-decoration: none; transition: border-color .15s, background .15s;
}
.guide-card:hover { border-color: #f59e0b; background: #161618; }
.guide-card h3 { display: flex; align-items: center; gap: .5rem; margin: 0 0 .375rem; font-size: 1.05rem; color: #fafafa; }
.guide-card p { margin: 0; color: #a1a1aa; font-size: .9rem; }
.guide-title { display: flex; align-items: center; gap: .6rem; }
.guide-card .ph-doc-icon,
.guide-title .ph-doc-icon {
    width: 1.1rem;
    height: 1.1rem;
    flex: 0 0 auto;
    color: #f59e0b;
}
.guide-title .ph-doc-icon {
    width: 1.35rem;
    height: 1.35rem;
}
`;

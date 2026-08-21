"""Diagram rendering via Mermaid, headless.

Covers the diagram families matplotlib cannot draw — flowcharts, sequence, gantt, state,
ER, class, mindmap, timeline, git graphs, journeys, quadrants, sankey, pie, and more.
Mermaid runs in a headless Chromium that Playwright already ships for the scraper, so this
adds no new system dependency.

The mermaid bundle is vendored under assets/vendor rather than pulled from a CDN: chart
rendering should not fail because a CDN is unreachable, and it keeps page loads offline.
"""

from __future__ import annotations

import asyncio
import io
import logging
from pathlib import Path


logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
MERMAID_JS_PATH = PROJECT_ROOT / "assets" / "vendor" / "mermaid.min.js"

RENDER_TIMEOUT_MS = 20_000
MAX_SOURCE_CHARS = 12_000

# Discord renders on dark backgrounds far more often than light ones.
BACKGROUND = "#1e1f22"

# Every diagram type Mermaid 11 supports. Listed explicitly so the tool description can
# name them — an LLM picks a diagram far more reliably when it can see the options.
DIAGRAM_KEYWORDS = (
    "graph",  # flowchart (legacy keyword)
    "flowchart",
    "sequenceDiagram",
    "classDiagram",
    "stateDiagram",
    "stateDiagram-v2",
    "erDiagram",
    "journey",
    "gantt",
    "pie",
    "quadrantChart",
    "requirementDiagram",
    "gitGraph",
    "mindmap",
    "timeline",
    "sankey-beta",
    "xychart-beta",
    "block-beta",
    "packet-beta",
    "kanban",
    "architecture-beta",
    "radar-beta",
    "treemap-beta",
    "c4Context",
)

_HTML_TEMPLATE = """<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><style>
    body {{ margin: 0; padding: 16px; background: {background}; }}
    .mermaid {{ background: {background}; }}
  </style></head>
  <body>
    <pre class="mermaid">{source}</pre>
    <script>{mermaid_js}</script>
    <script>
      mermaid.initialize({{
        startOnLoad: true,
        theme: "dark",
        securityLevel: "strict",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }});
    </script>
  </body>
</html>"""


class DiagramError(RuntimeError):
    """Rendering failed — usually invalid Mermaid syntax."""


def _escape(source: str) -> str:
    """Escape for embedding inside <pre>. Mermaid reads the element's text content."""
    return source.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def detect_diagram_type(source: str) -> str | None:
    """The Mermaid diagram keyword this source starts with, if any."""
    for line in source.strip().split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("%%"):
            continue
        first_word = stripped.split()[0].rstrip(":")
        for keyword in DIAGRAM_KEYWORDS:
            if first_word == keyword or stripped.startswith(keyword):
                return keyword
        return None
    return None


async def render_mermaid(source: str, *, width: int = 1100, height: int = 800) -> io.BytesIO:
    """Render Mermaid source to a PNG."""
    source = source.strip()
    if not source:
        raise DiagramError("Diagram source is empty")
    if len(source) > MAX_SOURCE_CHARS:
        raise DiagramError(f"Diagram source too long ({len(source)} chars, max {MAX_SOURCE_CHARS})")
    if not MERMAID_JS_PATH.is_file():
        raise DiagramError(f"Mermaid bundle missing at {MERMAID_JS_PATH}")

    try:
        from playwright.async_api import async_playwright
    except ImportError as e:
        raise DiagramError("Playwright is not installed; cannot render diagrams") from e

    html = _HTML_TEMPLATE.format(
        background=BACKGROUND,
        source=_escape(source),
        mermaid_js=MERMAID_JS_PATH.read_text(encoding="utf-8"),
    )

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
            try:
                page = await browser.new_page(
                    viewport={"width": width, "height": height},
                    # Retina-scale so text stays crisp when Discord scales the image.
                    device_scale_factor=2,
                )
                await page.set_content(html, wait_until="load")
                try:
                    await page.wait_for_selector(".mermaid svg", timeout=RENDER_TIMEOUT_MS)
                except Exception as e:
                    # Mermaid replaces the block with an error graphic on bad syntax, so a
                    # missing <svg> almost always means the source itself is invalid.
                    raise DiagramError(
                        "Mermaid could not render this diagram — check the syntax for the "
                        "declared diagram type."
                    ) from e

                # Invalid syntax doesn't throw — Mermaid swaps in an error graphic that is
                # still a valid <svg>. Posting that would show users a picture of an error
                # message, so detect it and report the failure as text instead.
                error_text = await page.evaluate(
                    """() => {
                        const el = document.querySelector('.mermaid');
                        if (!el) return null;
                        const svg = el.querySelector('svg');
                        const isError = (svg && svg.getAttribute('aria-roledescription') === 'error')
                            || !!el.querySelector('.error-icon, .error-text');
                        return isError ? (el.innerText || 'Syntax error').trim() : null;
                    }"""
                )
                if error_text:
                    first_line = error_text.split("\n")[0]
                    raise DiagramError(f"Invalid Mermaid syntax: {first_line}")

                element = await page.query_selector(".mermaid")
                if element is None:
                    raise DiagramError("Diagram element vanished after rendering")
                png = await element.screenshot(type="png")
            finally:
                await browser.close()
    except DiagramError:
        raise
    except Exception as e:
        logger.error("Mermaid render failed: %s", e)
        raise DiagramError(f"Diagram rendering failed: {e}") from e

    buffer = io.BytesIO(png)
    buffer.seek(0)
    return buffer


async def render_mermaid_safe(source: str, **kwargs) -> tuple[io.BytesIO | None, str | None]:
    """render_mermaid, but returns (buffer, error) instead of raising."""
    try:
        return await render_mermaid(source, **kwargs), None
    except DiagramError as e:
        return None, str(e)
    except asyncio.CancelledError:
        raise
    except Exception as e:
        return None, f"Unexpected rendering error: {e}"

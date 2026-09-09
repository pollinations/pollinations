"""render_visual tool: tables/charts/diagrams as image attachments.

Every path renders locally — no external model is involved:
  - type="table"   -> PIL renderer in discord.media
  - type=<chart>   -> matplotlib/seaborn in chart_renderer
  - anything else  -> Mermaid in headless Chromium (diagrams.py)

Discord does not render Mermaid fences. Diagrams and numeric charts must use this tool;
the resulting PNG is attached to the reply.

The result dict carries images via the ``_images`` (list) side-channel,
which `pollinations.py` extracts into content_blocks before the
result is shown to the model. The model only sees the text part.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
from typing import Any

from ..discord.media import render_table_image
from .chart_renderer import (
    CHARTS_AVAILABLE,
    get_executor,
    render_chart,
)
from .chart_renderer import (
    SUPPORTED_TYPES as CHART_TYPES,
)
from .diagrams import detect_diagram_type, render_mermaid_safe

logger = logging.getLogger(__name__)

TABLE_ROWS_PER_PAGE = 50
MAX_TABLE_PAGES = 10
MAX_CHART_POINTS = 100
MAX_HEATMAP_CELLS = 2_500


def _paginate_table(rows: list[list[str]]) -> list[list[list[str]]]:
    visible_rows = rows[: TABLE_ROWS_PER_PAGE * MAX_TABLE_PAGES]
    return [
        visible_rows[index : index + TABLE_ROWS_PER_PAGE] for index in range(0, len(visible_rows), TABLE_ROWS_PER_PAGE)
    ]


def _aggregate_chart_data(data: dict) -> tuple[dict, bool]:
    labels = list(data.get("labels") or [])
    datasets = list(data.get("datasets") or [])
    if len(labels) <= MAX_CHART_POINTS:
        return data, False

    bucket_size = max(1, (len(labels) + MAX_CHART_POINTS - 1) // MAX_CHART_POINTS)
    aggregate_labels = []
    aggregate_datasets = [{**dataset, "values": []} for dataset in datasets]
    for start in range(0, len(labels), bucket_size):
        stop = min(start + bucket_size, len(labels))
        aggregate_labels.append(labels[start] if stop - start == 1 else f"{labels[start]}–{labels[stop - 1]}")
        for output, dataset in zip(aggregate_datasets, datasets):
            values = dataset.get("values", [])[start:stop]
            numeric = [value for value in values if isinstance(value, (int, float)) and not isinstance(value, bool)]
            output["values"].append(sum(numeric))
    return {**data, "labels": aggregate_labels, "datasets": aggregate_datasets}, True


def _png_to_data_url(buf: io.BytesIO) -> str:
    buf.seek(0)
    encoded = base64.b64encode(buf.read()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _ok(message: str, images: list[str]) -> dict:
    return {"success": True, "message": message, "_images": images}


def _err(error: str) -> dict:
    return {"success": False, "error": error}


# =============================================================================
# Table dispatch
# =============================================================================


async def _render_table(title: str, data: dict, options: dict) -> dict:
    headers = data.get("headers") or []
    rows = data.get("rows") or []

    if not headers or not rows:
        return _err("Table requires data.headers and data.rows.")

    headers = [str(header) for header in headers]
    rows = [[str(cell) for cell in row] for row in rows]
    pages = _paginate_table(rows)
    images = []
    for page in pages:
        page_title = title if len(pages) == 1 else f"{title} · {len(images) + 1}/{len(pages)}"
        buffer, _links = await render_table_image(headers, page, title=page_title)
        if buffer is None:
            return _err("Table rendering failed (PIL unavailable or invalid input).")
        images.append(_png_to_data_url(buffer))

    message = title.strip() if title else "Table rendered."
    if len(pages) > 1:
        message += f" Split into {len(pages)} readable pages."
    if len(rows) > TABLE_ROWS_PER_PAGE * MAX_TABLE_PAGES:
        message += f" Showing the first {TABLE_ROWS_PER_PAGE * MAX_TABLE_PAGES} rows."
    return _ok(message, images)


# =============================================================================
# Chart dispatch (matplotlib/seaborn, off-thread)
# =============================================================================


async def _render_chart_async(chart_type: str, title: str, data: dict, options: dict) -> dict:
    loop = asyncio.get_running_loop()
    try:
        buf = await loop.run_in_executor(get_executor(), render_chart, chart_type, title, data, options)
    except Exception as e:
        logger.error(f"Chart executor failed: {e}", exc_info=True)
        return _err(f"Chart rendering raised: {e}")

    if buf is None:
        return _err(f"Chart type '{chart_type}' could not be rendered with the given data.")

    return _ok(title or f"{chart_type} chart rendered.", [_png_to_data_url(buf)])


# =============================================================================
# Terminal fallback — describe the shape rather than guessing
# =============================================================================


def _shape_help(chart_type: str, data: Any) -> dict:
    """Explain what to send instead of failing silently.

    Every rendering path is local now, so there is no sandbox to escalate to. A bare
    rejection here is what previously sent the model into a retry loop, so name the exact
    accepted shapes — one corrected call beats several blind ones.
    """
    got = type(data).__name__
    if isinstance(data, dict):
        got = f"dict with keys {sorted(data)[:8]}"

    return _err(
        f"Could not render '{chart_type or 'unknown'}' from {got}. "
        "Send one of:\n"
        '  table:   {"headers": [...], "rows": [[...], ...]}\n'
        '  chart:   {"labels": [...], "values": [...]}  (or a flat {"Label": number} map)\n'
        "  diagram: Mermaid source as a plain string, e.g. "
        '"flowchart TD\\n  A --> B" — any Mermaid type works '
        "(flowchart, sequenceDiagram, gantt, pie, mindmap, timeline, gitGraph, ...).\n"
        "Discord does not render Mermaid fences; use this tool for every diagram."
    )


# =============================================================================
# Public tool handler
# =============================================================================


def _parse_markdown_table(text: str) -> dict | None:
    """Read a pipe-delimited markdown table into {headers, rows}."""
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    rows = [
        [c.strip() for c in ln.strip().strip("|").split("|")]
        for ln in lines
        if "|" in ln
        # Drop the |---|---| separator; it is layout, not data.
        and not set(ln.strip().strip("|").replace("|", "")) <= set("-: ")
    ]
    if len(rows) < 2:
        return None
    width = len(rows[0])
    body = [r[:width] + [""] * (width - len(r)) for r in rows[1:]]
    return {"headers": rows[0], "rows": body}


def _normalize_table_data(data: Any) -> dict | None:
    """Coerce plausible table shapes into {headers, rows}.

    Accepts the canonical form, a list of uniform dicts (the shape most models reach for
    first), a list of lists with a header row, or a table written as a plain string —
    markdown, JSON, or CSV. A model asked for "a table" very often just writes one out, and
    rejecting that only makes it write the same thing again.
    """
    if isinstance(data, str):
        text = data.strip()
        if not text:
            return None
        if "|" in text:
            parsed = _parse_markdown_table(text)
            if parsed:
                return parsed
        if text[0] in "{[":
            try:
                return _normalize_table_data(json.loads(text))
            except (ValueError, TypeError):
                pass
        # CSV as a last resort: needs a delimiter and at least a header plus one row.
        lines = [ln for ln in text.splitlines() if ln.strip()]
        if len(lines) >= 2 and all("," in ln for ln in lines[:2]):
            rows = [[c.strip() for c in ln.split(",")] for ln in lines]
            return {"headers": rows[0], "rows": rows[1:]}
        return None

    if isinstance(data, dict):
        if data.get("headers") and data.get("rows"):
            return data
        # {"columns": [...], "data": [[...]]} and similar aliases.
        headers = data.get("headers") or data.get("columns") or data.get("fields")
        rows = data.get("rows") or data.get("data") or data.get("values")
        if headers and rows:
            return {"headers": list(headers), "rows": [list(r) for r in rows]}
        return None

    if isinstance(data, list) and data:
        if all(isinstance(r, dict) for r in data):
            headers = list(data[0].keys())
            return {"headers": headers, "rows": [[r.get(h, "") for h in headers] for r in data]}
        if all(isinstance(r, (list, tuple)) for r in data) and len(data) > 1:
            return {"headers": list(data[0]), "rows": [list(r) for r in data[1:]]}

    return None


def _normalize_chart_data(data: Any) -> dict | None:
    """Coerce the shapes a model actually sends into {labels, datasets}.

    The canonical shape is nested and easy to get wrong, and a rejection just makes the
    model guess again — several rounds of that is what turned one chart request into a
    minute of retries. These forms are all unambiguous, so accept them:

        {"Text": 60, "Image": 40}                       flat mapping
        {"labels": [...], "values": [...]}              parallel arrays
        {"labels": [...], "data": [...]}                same, other key
        [{"label": "Text", "value": 60}, ...]           list of pairs
    """
    if isinstance(data, str):
        text = data.strip()
        if text[:1] in ("{", "["):
            try:
                return _normalize_chart_data(json.loads(text))
            except (ValueError, TypeError):
                return None
        return None

    if isinstance(data, list):
        pairs = [d for d in data if isinstance(d, dict)]
        labels, values = [], []
        for d in pairs:
            label = d.get("label") or d.get("name") or d.get("key")
            value = d.get("value") if "value" in d else d.get("count")
            if label is None or value is None:
                return None
            labels.append(str(label))
            values.append(value)
        if not labels:
            return None
        return {"labels": labels, "datasets": [{"label": "", "values": values}]}

    if not isinstance(data, dict):
        return None

    if isinstance(data.get("datasets"), list) and data["datasets"]:
        return data

    series = data.get("values") or data.get("data")
    if isinstance(series, list) and series:
        if series and isinstance(series[0], dict):
            # {"labels": [...], "data": [{label, values}, ...]} — datasets by another name.
            return {"labels": data.get("labels", []), "datasets": series}
        return {"labels": data.get("labels", []), "datasets": [{"label": "", "values": series}]}

    # Flat mapping of label -> number.
    numeric = {k: v for k, v in data.items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
    if numeric and len(numeric) == len(data):
        return {
            "labels": [str(k) for k in numeric],
            "datasets": [{"label": "", "values": list(numeric.values())}],
        }

    return None


async def render_visual(
    type: str | None = None,
    title: str = "",
    data: Any = None,
    options: dict | None = None,
    **kwargs,
) -> dict:
    """Tool handler. AI calls render_visual(type, title, data, options).

    Every path renders locally: tables via PIL, charts via matplotlib, everything else via
    Mermaid in headless Chromium. Nothing is handed to an external model.
    """
    options = options or {}
    chart_type = (type or "").strip().lower() if type else ""

    # No type given: infer one. Mermaid source and table/chart shapes are all recognizable
    # on their own, so a missing `type` is not worth an error.
    if chart_type in ("", "free_form", "freeform"):
        if isinstance(data, str) and detect_diagram_type(data):
            chart_type = "diagram"
        elif _normalize_table_data(data):
            chart_type = "table"
        elif _normalize_chart_data(data):
            chart_type = "bar"
        else:
            return _shape_help(chart_type, data)

    # Mermaid source is unmistakable, so honour it whatever `type` claims — a model that
    # asks for a "sequence_diagram" and passes Mermaid should get its diagram, not a
    # lecture about the enum.
    inline_source = data if isinstance(data, str) else (data or {}).get("source", "") if isinstance(data, dict) else ""
    if inline_source and detect_diagram_type(inline_source):
        buffer, error = await render_mermaid_safe(inline_source)
        if buffer:
            kind = detect_diagram_type(inline_source) or "diagram"
            return _ok(title or f"{kind} rendered.", [_png_to_data_url(buffer)])
        logger.info("Mermaid render failed (%s); trying other renderers", error)

    if chart_type == "table":
        table = _normalize_table_data(data)
        if table:
            return await _render_table(title, table, options)
        logger.info("Table data not usable; falling back")

    if chart_type in ("diagram", "mermaid"):
        source = inline_source or str(data or "")
        buffer, error = await render_mermaid_safe(source)
        if buffer:
            kind = detect_diagram_type(source) or "diagram"
            return _ok(title or f"{kind} rendered.", [_png_to_data_url(buffer)])
        # Mermaid reports the offending line, so pass that through verbatim — it is far
        # more actionable than a generic failure.
        return _err(f"Diagram did not render: {error}")

    if chart_type in CHART_TYPES:
        if not CHARTS_AVAILABLE:
            return _err("Chart rendering is unavailable (matplotlib not installed).")
        normalized = _normalize_chart_data(data)
        if not normalized:
            return _shape_help(chart_type, data)
        if chart_type == "heatmap":
            rows = normalized.get("datasets") or normalized.get("rows") or []
            columns = normalized.get("labels") or []
            if len(rows) * max(1, len(columns)) > MAX_HEATMAP_CELLS:
                return _err("Heatmap is too dense to render readably; summarize it to at most 2,500 cells.")
        normalized, aggregated = _aggregate_chart_data(normalized)
        result = await _render_chart_async(chart_type, title, normalized, options)
        if result.get("success") and aggregated:
            original_points = len(data.get("labels", [])) if isinstance(data, dict) else 0
            result[
                "message"
            ] += f" Aggregated {original_points} points into {len(normalized['labels'])} readable buckets."
        if result.get("success"):
            return result
        return result

    # An unrecognized type is often a diagram name Mermaid knows even though our enum
    # does not, so give the source one chance as Mermaid before giving up.
    if isinstance(data, str) and data.strip():
        buffer, error = await render_mermaid_safe(data)
        if buffer:
            return _ok(title or "Diagram rendered.", [_png_to_data_url(buffer)])
        logger.info("Unknown type '%s' and not valid Mermaid: %s", type, error)

    return _shape_help(chart_type, data)

"""Chart rendering for Polly's render_visual tool.

Matplotlib + seaborn engine. Output is a Discord-dark-themed PNG. All
matplotlib calls are blocking and must be invoked through
``await loop.run_in_executor(_EXECUTOR, ...)`` from async code.

Supported types: bar, horizontal_bar, line, area, scatter, pie, donut,
heatmap, histogram. Any other type returns None and the caller falls
through to the Gemini code-execution path.
"""

from __future__ import annotations

import io
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

try:
    import matplotlib

    matplotlib.use("Agg")  # headless backend — must precede pyplot
    import matplotlib.pyplot as plt
    import numpy as np
    import seaborn as sns

    CHARTS_AVAILABLE = True
except ImportError as _e:
    CHARTS_AVAILABLE = False
    plt = None  # type: ignore[assignment]
    np = None  # type: ignore[assignment]
    sns = None  # type: ignore[assignment]
    _IMPORT_ERROR = _e

logger = logging.getLogger(__name__)
if not CHARTS_AVAILABLE:
    logger.warning(f"matplotlib/seaborn/numpy unavailable - chart rendering disabled: {_IMPORT_ERROR}")

# =============================================================================
# Theme — Discord dark mode palette
# =============================================================================

PALETTE = {
    "bg": "#313338",
    "axes_bg": "#2b2d31",
    "grid": "#40444b",
    "border": "#40444b",
    "text": "#dcddde",
    "muted": "#b9bbbe",
    "title": "#ffffff",
    # Categorical accent series (Discord brand + extended)
    "series": [
        "#5865f2",  # blurple
        "#57f287",  # green
        "#faa61a",  # gold
        "#ed4245",  # red
        "#eb459e",  # fuchsia
        "#3ba55d",  # mint
        "#5dade2",  # cyan
        "#a569bd",  # purple
        "#f1c40f",  # yellow
        "#e67e22",  # orange
    ],
    "positive": "#57f287",
    "negative": "#ed4245",
}


def _apply_theme() -> None:
    """Apply Discord-dark rcParams. Idempotent."""
    if not CHARTS_AVAILABLE:
        return
    plt.rcParams.update(
        {
            "figure.facecolor": PALETTE["bg"],
            "axes.facecolor": PALETTE["axes_bg"],
            "axes.edgecolor": PALETTE["border"],
            "axes.labelcolor": PALETTE["text"],
            "axes.titlecolor": PALETTE["title"],
            "axes.titlesize": 14,
            "axes.titleweight": "bold",
            "axes.labelsize": 11,
            "axes.grid": True,
            "grid.color": PALETTE["grid"],
            "grid.alpha": 0.5,
            "grid.linewidth": 0.6,
            "xtick.color": PALETTE["muted"],
            "ytick.color": PALETTE["muted"],
            "xtick.labelsize": 10,
            "ytick.labelsize": 10,
            "text.color": PALETTE["text"],
            "font.family": "DejaVu Sans",
            "font.size": 11,
            "legend.facecolor": PALETTE["axes_bg"],
            "legend.edgecolor": PALETTE["border"],
            "legend.labelcolor": PALETTE["text"],
            "legend.fontsize": 10,
            "savefig.facecolor": PALETTE["bg"],
            "savefig.edgecolor": PALETTE["bg"],
            "axes.spines.top": False,
            "axes.spines.right": False,
        }
    )
    sns.set_theme(style="darkgrid", rc=plt.rcParams)


_apply_theme()


# =============================================================================
# Async executor — never run matplotlib on the event loop
# =============================================================================

_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="chart")


def get_executor() -> ThreadPoolExecutor:
    """Module-level executor for callers."""
    return _EXECUTOR


# =============================================================================
# Render dispatch
# =============================================================================

SUPPORTED_TYPES = {
    "bar",
    "horizontal_bar",
    "line",
    "area",
    "scatter",
    "pie",
    "donut",
    "heatmap",
    "histogram",
}


def render_chart(
    chart_type: str,
    title: str,
    data: dict[str, Any],
    options: dict[str, Any] | None = None,
) -> io.BytesIO | None:
    """Render a chart. Returns a PNG buffer or None if the type is unsupported.

    Blocking. Call via run_in_executor from async code.
    """
    if not CHARTS_AVAILABLE:
        logger.warning("render_chart called but matplotlib/seaborn unavailable")
        return None

    options = options or {}
    chart_type = (chart_type or "").lower()

    if chart_type not in SUPPORTED_TYPES:
        return None

    fig = None
    try:
        if chart_type == "bar":
            fig = _render_bar(title, data, options, horizontal=False)
        elif chart_type == "horizontal_bar":
            fig = _render_bar(title, data, options, horizontal=True)
        elif chart_type == "line":
            fig = _render_line(title, data, options, fill=False)
        elif chart_type == "area":
            fig = _render_line(title, data, options, fill=True)
        elif chart_type == "scatter":
            fig = _render_scatter(title, data, options)
        elif chart_type == "pie":
            fig = _render_pie(title, data, options, donut=False)
        elif chart_type == "donut":
            fig = _render_pie(title, data, options, donut=True)
        elif chart_type == "heatmap":
            fig = _render_heatmap(title, data, options)
        elif chart_type == "histogram":
            fig = _render_histogram(title, data, options)

        if fig is None:
            return None

        caption = options.get("caption")
        if caption:
            fig.text(
                0.5,
                0.01,
                caption,
                ha="center",
                va="bottom",
                fontsize=9,
                color=PALETTE["muted"],
                style="italic",
            )

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
        buf.seek(0)
        return buf

    except Exception as e:
        logger.error(f"Chart render failed ({chart_type}): {e}", exc_info=True)
        return None
    finally:
        if fig is not None:
            plt.close(fig)


# =============================================================================
# Data normalization
# =============================================================================


def _datasets(data: dict) -> list[dict]:
    """Coerce data['datasets'] to a list of {label, values} dicts."""
    raw = data.get("datasets") or []
    out = []
    for d in raw:
        if not isinstance(d, dict):
            continue
        values = d.get("values") or []
        clean = []
        for v in values:
            try:
                clean.append(float(v))
            except (TypeError, ValueError):
                clean.append(np.nan)
        out.append({"label": str(d.get("label", "")), "values": clean})
    return out


def _labels(data: dict, fallback_n: int = 0) -> list[str]:
    """Pull data['labels'], or generate sequential placeholders."""
    labels = data.get("labels")
    if labels:
        return [str(x) for x in labels]
    return [str(i + 1) for i in range(fallback_n)]


def _color_cycle(n: int) -> list[str]:
    base = PALETTE["series"]
    if n <= len(base):
        return base[:n]
    return [base[i % len(base)] for i in range(n)]


# =============================================================================
# Individual chart types
# =============================================================================


def _render_bar(title: str, data: dict, options: dict, horizontal: bool) -> plt.Figure | None:
    datasets = _datasets(data)
    if not datasets or not any(d["values"] for d in datasets):
        return None

    labels = _labels(data, fallback_n=len(datasets[0]["values"]))
    sort = bool(options.get("sort"))
    stacked = bool(options.get("stacked"))

    if sort and len(datasets) == 1:
        paired = sorted(zip(datasets[0]["values"], labels), reverse=True)
        sorted_vals, labels = zip(*paired)
        datasets[0]["values"] = list(sorted_vals)
        labels = list(labels)

    n_groups = len(labels)
    n_series = len(datasets)
    fig_w = max(8, min(16, n_groups * 0.7 + 4))
    fig_h = max(5, min(10, fig_w * 0.55))
    fig, ax = plt.subplots(figsize=(fig_w, fig_h))
    ax.set_title(title)

    colors = _color_cycle(n_series)
    bar_width = 0.8 / max(1, n_series) if not stacked else 0.6
    indices = np.arange(n_groups)

    if horizontal:
        bottom = np.zeros(n_groups)
        for i, ds in enumerate(datasets):
            vals = np.array(ds["values"], dtype=float)
            color_per_bar = (
                [PALETTE["positive"] if v >= 0 else PALETTE["negative"] for v in vals] if n_series == 1 else colors[i]
            )
            if stacked:
                ax.barh(indices, vals, color=color_per_bar, label=ds["label"], left=bottom)
                bottom = bottom + np.nan_to_num(vals)
            else:
                offset = (i - (n_series - 1) / 2) * bar_width
                ax.barh(indices + offset, vals, height=bar_width, color=color_per_bar, label=ds["label"])
        ax.set_yticks(indices)
        ax.set_yticklabels(labels)
        ax.invert_yaxis()
        ax.axvline(0, color=PALETTE["muted"], linewidth=0.8)
        if options.get("x_label"):
            ax.set_xlabel(options["x_label"])
        if options.get("y_label"):
            ax.set_ylabel(options["y_label"])
    else:
        bottom = np.zeros(n_groups)
        for i, ds in enumerate(datasets):
            vals = np.array(ds["values"], dtype=float)
            color_per_bar = (
                [PALETTE["positive"] if v >= 0 else PALETTE["negative"] for v in vals] if n_series == 1 else colors[i]
            )
            if stacked:
                ax.bar(indices, vals, color=color_per_bar, label=ds["label"], bottom=bottom)
                bottom = bottom + np.nan_to_num(vals)
            else:
                offset = (i - (n_series - 1) / 2) * bar_width
                ax.bar(indices + offset, vals, width=bar_width, color=color_per_bar, label=ds["label"])
        ax.set_xticks(indices)
        ax.set_xticklabels(
            labels,
            rotation=30 if any(len(l) > 6 for l in labels) else 0,
            ha="right" if any(len(l) > 6 for l in labels) else "center",
        )
        ax.axhline(0, color=PALETTE["muted"], linewidth=0.8)
        if options.get("x_label"):
            ax.set_xlabel(options["x_label"])
        if options.get("y_label"):
            ax.set_ylabel(options["y_label"])

    if n_series > 1 or any(d["label"] for d in datasets):
        ax.legend(loc="best")

    fig.tight_layout()
    return fig


def _render_line(title: str, data: dict, options: dict, fill: bool) -> plt.Figure | None:
    datasets = _datasets(data)
    if not datasets:
        return None

    labels = _labels(data, fallback_n=len(datasets[0]["values"]))
    n = len(labels)
    x = np.arange(n)

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.set_title(title)
    colors = _color_cycle(len(datasets))

    for i, ds in enumerate(datasets):
        vals = np.array(ds["values"], dtype=float)
        if len(vals) != n:
            # Pad/trim to match labels.
            if len(vals) < n:
                vals = np.concatenate([vals, np.full(n - len(vals), np.nan)])
            else:
                vals = vals[:n]
        ax.plot(x, vals, color=colors[i], linewidth=2.0, marker="o", markersize=5, label=ds["label"])
        if fill:
            ax.fill_between(x, vals, color=colors[i], alpha=0.25)

    ax.set_xticks(x)
    ax.set_xticklabels(
        labels,
        rotation=30 if any(len(l) > 6 for l in labels) else 0,
        ha="right" if any(len(l) > 6 for l in labels) else "center",
    )
    if options.get("x_label"):
        ax.set_xlabel(options["x_label"])
    if options.get("y_label"):
        ax.set_ylabel(options["y_label"])
    if len(datasets) > 1 or any(d["label"] for d in datasets):
        ax.legend(loc="best")

    fig.tight_layout()
    return fig


def _render_scatter(title: str, data: dict, options: dict) -> plt.Figure | None:
    datasets = _datasets(data)
    labels = _labels(data, fallback_n=0)

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.set_title(title)
    colors = _color_cycle(max(1, len(datasets)))

    if not datasets:
        return None

    if labels and len(datasets) == 1:
        # Single series with x-from-labels, y-from-values
        x_numeric = []
        for lbl in labels:
            try:
                x_numeric.append(float(lbl))
            except (TypeError, ValueError):
                x_numeric = list(range(len(labels)))
                break
        y = datasets[0]["values"][: len(x_numeric)]
        ax.scatter(x_numeric, y, color=colors[0], s=60, alpha=0.85, edgecolor=PALETTE["bg"], linewidth=0.5)
        if isinstance(x_numeric[0], float):
            pass  # numeric ticks ok
        else:
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels, rotation=30, ha="right")
    else:
        # Multi-series: each dataset[i] = y values; x = index
        for i, ds in enumerate(datasets):
            vals = ds["values"]
            ax.scatter(
                range(len(vals)),
                vals,
                color=colors[i],
                s=60,
                alpha=0.85,
                label=ds["label"],
                edgecolor=PALETTE["bg"],
                linewidth=0.5,
            )
        ax.legend(loc="best")

    if options.get("x_label"):
        ax.set_xlabel(options["x_label"])
    if options.get("y_label"):
        ax.set_ylabel(options["y_label"])

    fig.tight_layout()
    return fig


def _render_pie(title: str, data: dict, options: dict, donut: bool) -> plt.Figure | None:
    datasets = _datasets(data)
    labels = _labels(data, fallback_n=0)

    if not datasets or not datasets[0]["values"]:
        return None

    values = np.array([v for v in datasets[0]["values"] if not np.isnan(v) and v >= 0], dtype=float)
    if len(values) == 0 or values.sum() == 0:
        return None

    # Trim labels to match cleaned values.
    labels = labels[: len(values)]
    if len(labels) < len(values):
        labels = labels + [f"Series {i + 1}" for i in range(len(labels), len(values))]

    # Aggregate tiny slices below 2% into "Other".
    total = values.sum()
    keep_mask = (values / total) >= 0.02
    if (~keep_mask).any() and keep_mask.sum() < len(values) - 1:
        other_total = values[~keep_mask].sum()
        values = np.append(values[keep_mask], other_total)
        labels = [labels[i] for i, k in enumerate(keep_mask) if k] + ["Other"]

    # Cap at 20 wedges; rest goes into Other.
    if len(values) > 20:
        head_v = values[:19]
        tail_v = values[19:].sum()
        values = np.append(head_v, tail_v)
        labels = labels[:19] + [f"Other ({len(labels) - 19})"]

    fig, ax = plt.subplots(figsize=(8, 8))
    ax.set_title(title)
    colors = _color_cycle(len(values))

    wedge_kwargs = {"width": 0.45} if donut else {}
    wedges, _, autotexts = ax.pie(
        values,
        labels=labels,
        colors=colors,
        autopct=lambda pct: f"{pct:.1f}%" if pct >= 3 else "",
        startangle=90,
        textprops={"color": PALETTE["text"], "fontsize": 11},
        wedgeprops={"edgecolor": PALETTE["bg"], "linewidth": 1.2, **wedge_kwargs},
    )
    for t in autotexts:
        t.set_color("#0e0e10")
        t.set_fontweight("bold")

    ax.axis("equal")
    fig.tight_layout()
    return fig


def _render_heatmap(title: str, data: dict, options: dict) -> plt.Figure | None:
    """Heatmap requires data: {labels: [col labels], rows: [{label, values}, ...]}.

    Falls back to: data['datasets'] = [{label: row_label, values: row_values}, ...].
    """
    datasets = _datasets(data)
    if not datasets:
        # Allow data['rows'] = [[...], [...]] for raw matrix input
        rows = data.get("rows")
        if not rows:
            return None
        matrix = np.array(rows, dtype=float)
        row_labels = data.get("row_labels") or [f"R{i + 1}" for i in range(len(rows))]
    else:
        matrix = np.array([d["values"] for d in datasets], dtype=float)
        row_labels = [d["label"] or f"R{i + 1}" for i, d in enumerate(datasets)]

    col_labels = _labels(data, fallback_n=matrix.shape[1] if matrix.size else 0)
    if len(col_labels) != matrix.shape[1]:
        col_labels = [f"C{i + 1}" for i in range(matrix.shape[1])]

    fig_w = max(8, min(16, matrix.shape[1] * 0.6 + 4))
    fig_h = max(5, min(12, matrix.shape[0] * 0.5 + 3))
    fig, ax = plt.subplots(figsize=(fig_w, fig_h))
    ax.set_title(title)

    sns.heatmap(
        matrix,
        annot=True,
        fmt=".2g",
        cmap="rocket_r",
        ax=ax,
        xticklabels=col_labels,
        yticklabels=row_labels,
        cbar_kws={"label": options.get("y_label", "")},
        linewidths=0.5,
        linecolor=PALETTE["border"],
        annot_kws={"color": PALETTE["title"], "fontsize": 9},
    )

    if options.get("x_label"):
        ax.set_xlabel(options["x_label"])
    plt.setp(ax.get_xticklabels(), rotation=30, ha="right")

    fig.tight_layout()
    return fig


def _render_histogram(title: str, data: dict, options: dict) -> plt.Figure | None:
    datasets = _datasets(data)
    if not datasets:
        return None

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.set_title(title)
    colors = _color_cycle(len(datasets))

    for i, ds in enumerate(datasets):
        vals = np.array([v for v in ds["values"] if not np.isnan(v)], dtype=float)
        if len(vals) == 0:
            continue
        bins = min(30, max(8, int(np.sqrt(len(vals)))))
        ax.hist(
            vals,
            bins=bins,
            color=colors[i],
            alpha=0.7,
            edgecolor=PALETTE["bg"],
            linewidth=0.5,
            label=ds["label"] or None,
        )

    if any(d["label"] for d in datasets):
        ax.legend(loc="best")
    if options.get("x_label"):
        ax.set_xlabel(options["x_label"])
    if options.get("y_label"):
        ax.set_ylabel(options["y_label"])

    fig.tight_layout()
    return fig

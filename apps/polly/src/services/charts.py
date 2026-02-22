"""Chart generation service for Polly bot.

Renders data visualizations using matplotlib + mplcyberpunk with a dark theme
matching Discord's background. Returns base64 PNG via the _image side-channel.
"""

import base64
import io
import logging
import math

import matplotlib
import matplotlib.pyplot as plt
import mplcyberpunk
import numpy as np

matplotlib.use("Agg")  # Non-interactive backend

logger = logging.getLogger(__name__)

# Discord-matched dark theme colors
BG_COLOR = "#313338"
TEXT_COLOR = "#DCDDDE"
MUTED_COLOR = "#72767D"
GRID_COLOR = "#3F4147"

# Color palettes for charts
PALETTES = {
    "neon": ["#08F7FE", "#FE53BB", "#F5D300", "#09FBD3", "#FF6B6B", "#C34AFF", "#FF9F43", "#00FF88"],
    "pastel": ["#A8D8EA", "#FFB7B2", "#FFDAC1", "#B5EAD7", "#E2F0CB", "#C7CEEA", "#F0E6EF", "#D4E7C5"],
    "warm": ["#FF6B6B", "#FFA07A", "#FFD700", "#FF8C00", "#FF4500", "#E74C3C", "#F39C12", "#D35400"],
    "cool": ["#08F7FE", "#00CED1", "#4169E1", "#6A5ACD", "#00FF88", "#09FBD3", "#1E90FF", "#7B68EE"],
    "monochrome": ["#08F7FE", "#06C4CB", "#049199", "#025F67", "#013E42", "#07D9E3", "#0AECF7", "#03858D"],
}

# Figure settings
FIG_WIDTH = 10
FIG_HEIGHT = 5
FIG_DPI = 150


def _get_colors(palette: str, count: int) -> list[str]:
    """Get a list of colors from a palette, cycling if needed."""
    colors = PALETTES.get(palette, PALETTES["neon"])
    return [colors[i % len(colors)] for i in range(count)]


def _setup_figure(
    title: str = "",
    subtitle: str = "",
    figsize: tuple = (FIG_WIDTH, FIG_HEIGHT),
) -> tuple[plt.Figure, plt.Axes]:
    """Create a figure with the Discord dark theme."""
    plt.style.use("cyberpunk")

    fig, ax = plt.subplots(figsize=figsize)
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor(BG_COLOR)

    # Style axes
    ax.tick_params(colors=TEXT_COLOR, which="both")
    for spine in ax.spines.values():
        spine.set_color(GRID_COLOR)

    ax.xaxis.label.set_color(TEXT_COLOR)
    ax.yaxis.label.set_color(TEXT_COLOR)

    if title:
        ax.set_title(title, color=TEXT_COLOR, fontsize=14, fontweight="bold", pad=15)
    if subtitle:
        fig.text(0.5, 0.93, subtitle, ha="center", color=MUTED_COLOR, fontsize=10)

    return fig, ax


def _finalize_figure(
    fig: plt.Figure,
    ax: plt.Axes,
    show_legend: bool = True,
    show_grid: bool = True,
    x_label: str = "",
    y_label: str = "",
    glow: bool = True,
) -> str:
    """Apply final styling, render to base64 PNG, and close."""
    if x_label:
        ax.set_xlabel(x_label, color=TEXT_COLOR, fontsize=11)
    if y_label:
        ax.set_ylabel(y_label, color=TEXT_COLOR, fontsize=11)

    if show_grid:
        ax.grid(True, alpha=0.15, color=GRID_COLOR)
    else:
        ax.grid(False)

    if show_legend and ax.get_legend_handles_labels()[1]:
        legend = ax.legend(
            facecolor=BG_COLOR,
            edgecolor=GRID_COLOR,
            labelcolor=TEXT_COLOR,
            fontsize=9,
        )
        legend.get_frame().set_alpha(0.8)

    if glow:
        try:
            mplcyberpunk.add_glow_effects(ax)
        except Exception:
            pass  # Glow is cosmetic, don't fail on it

    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=FIG_DPI, facecolor=BG_COLOR, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)

    b64 = base64.b64encode(buf.read()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def _render_bar(data: dict, options: dict) -> str:
    """Render a bar chart."""
    labels = data.get("labels", [])
    datasets = data.get("datasets", [])
    horizontal = options.get("horizontal", False)
    stacked = options.get("stacked", False)
    show_values = options.get("show_values", True)
    palette = options.get("color_palette", "neon")
    max_items = options.get("max_items")

    if max_items and len(labels) > max_items:
        labels = labels[:max_items]
        datasets = [
            {**ds, "values": ds["values"][:max_items]} for ds in datasets
        ]

    fig, ax = _setup_figure(options.get("title", ""), options.get("subtitle", ""))
    colors = _get_colors(palette, len(datasets))

    x = np.arange(len(labels))
    n = len(datasets)
    width = 0.7 / n if not stacked else 0.7

    bottoms = np.zeros(len(labels))

    for i, ds in enumerate(datasets):
        values = ds.get("values", [])
        # Pad values if shorter than labels
        values = values + [0] * (len(labels) - len(values))
        color = colors[i]
        name = ds.get("name", f"Series {i + 1}")

        if horizontal:
            if stacked:
                bars = ax.barh(x, values, height=width, label=name, color=color, alpha=0.85, left=bottoms)
                bottoms += np.array(values)
            else:
                bars = ax.barh(x + i * width - (n - 1) * width / 2, values, height=width, label=name, color=color, alpha=0.85)
        else:
            if stacked:
                bars = ax.bar(x, values, width=width, label=name, color=color, alpha=0.85, bottom=bottoms)
                bottoms += np.array(values)
            else:
                bars = ax.bar(x + i * width - (n - 1) * width / 2, values, width=width, label=name, color=color, alpha=0.85)

        if show_values:
            for bar in bars:
                if horizontal:
                    val = bar.get_width()
                    if val != 0:
                        ax.text(val, bar.get_y() + bar.get_height() / 2, f" {val:g}", va="center", color=TEXT_COLOR, fontsize=8)
                else:
                    val = bar.get_height()
                    if val != 0:
                        ax.text(bar.get_x() + bar.get_width() / 2, val, f"{val:g}", ha="center", va="bottom", color=TEXT_COLOR, fontsize=8)

    if horizontal:
        ax.set_yticks(x)
        ax.set_yticklabels(labels, color=TEXT_COLOR, fontsize=9)
    else:
        ax.set_xticks(x)
        ax.set_xticklabels(labels, color=TEXT_COLOR, fontsize=9, rotation=45 if len(labels) > 6 else 0, ha="right" if len(labels) > 6 else "center")

    return _finalize_figure(
        fig, ax,
        show_legend=options.get("show_legend", len(datasets) > 1),
        show_grid=options.get("show_grid", True),
        x_label=options.get("x_label", ""),
        y_label=options.get("y_label", ""),
    )


def _render_line(data: dict, options: dict) -> str:
    """Render a line chart."""
    labels = data.get("labels", [])
    datasets = data.get("datasets", [])
    palette = options.get("color_palette", "neon")

    fig, ax = _setup_figure(options.get("title", ""), options.get("subtitle", ""))
    colors = _get_colors(palette, len(datasets))

    for i, ds in enumerate(datasets):
        values = ds.get("values", [])
        name = ds.get("name", f"Series {i + 1}")
        ax.plot(labels[:len(values)], values, color=colors[i], label=name, linewidth=2, marker="o", markersize=4)

        if options.get("show_values"):
            for j, v in enumerate(values):
                ax.annotate(f"{v:g}", (labels[j], v), textcoords="offset points", xytext=(0, 8), ha="center", color=TEXT_COLOR, fontsize=7)

    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, color=TEXT_COLOR, fontsize=9, rotation=45 if len(labels) > 8 else 0, ha="right" if len(labels) > 8 else "center")

    return _finalize_figure(
        fig, ax,
        show_legend=options.get("show_legend", len(datasets) > 1),
        show_grid=options.get("show_grid", True),
        x_label=options.get("x_label", ""),
        y_label=options.get("y_label", ""),
    )


def _render_area(data: dict, options: dict) -> str:
    """Render an area chart."""
    labels = data.get("labels", [])
    datasets = data.get("datasets", [])
    stacked = options.get("stacked", False)
    palette = options.get("color_palette", "neon")

    fig, ax = _setup_figure(options.get("title", ""), options.get("subtitle", ""))
    colors = _get_colors(palette, len(datasets))

    x = range(len(labels))

    if stacked:
        all_values = [ds.get("values", []) for ds in datasets]
        names = [ds.get("name", f"Series {i + 1}") for i, ds in enumerate(datasets)]
        ax.stackplot(x, *all_values, labels=names, colors=colors, alpha=0.6)
    else:
        for i, ds in enumerate(datasets):
            values = ds.get("values", [])
            name = ds.get("name", f"Series {i + 1}")
            ax.fill_between(x[:len(values)], values, alpha=0.3, color=colors[i])
            ax.plot(x[:len(values)], values, color=colors[i], label=name, linewidth=2)

    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, color=TEXT_COLOR, fontsize=9, rotation=45 if len(labels) > 8 else 0, ha="right" if len(labels) > 8 else "center")

    return _finalize_figure(
        fig, ax,
        show_legend=options.get("show_legend", True),
        show_grid=options.get("show_grid", True),
        x_label=options.get("x_label", ""),
        y_label=options.get("y_label", ""),
    )


def _render_pie(data: dict, options: dict, donut: bool = False) -> str:
    """Render a pie or donut chart."""
    labels = data.get("labels", [])
    values = data.get("values", [])
    palette = options.get("color_palette", "neon")
    max_items = options.get("max_items")

    if max_items and len(labels) > max_items:
        # Group smaller slices into "Other"
        sorted_pairs = sorted(zip(values, labels), reverse=True)
        top = sorted_pairs[:max_items - 1]
        rest = sorted_pairs[max_items - 1:]
        values = [v for v, _ in top] + [sum(v for v, _ in rest)]
        labels = [l for _, l in top] + ["Other"]

    fig, ax = _setup_figure(options.get("title", ""), options.get("subtitle", ""))
    colors = _get_colors(palette, len(labels))

    wedge_props = {"edgecolor": BG_COLOR, "linewidth": 2}

    wedges, texts, autotexts = ax.pie(
        values,
        labels=labels,
        colors=colors,
        autopct="%1.1f%%",
        pctdistance=0.75 if donut else 0.6,
        wedgeprops=wedge_props,
        textprops={"color": TEXT_COLOR, "fontsize": 9},
    )

    for t in autotexts:
        t.set_color(TEXT_COLOR)
        t.set_fontsize(8)

    if donut:
        centre_circle = plt.Circle((0, 0), 0.55, fc=BG_COLOR)
        ax.add_artist(centre_circle)

    ax.set_aspect("equal")

    return _finalize_figure(fig, ax, show_legend=False, show_grid=False, glow=False)


def _render_scatter(data: dict, options: dict) -> str:
    """Render a scatter plot."""
    datasets = data.get("datasets", [])
    palette = options.get("color_palette", "neon")

    fig, ax = _setup_figure(options.get("title", ""), options.get("subtitle", ""))
    colors = _get_colors(palette, len(datasets))

    for i, ds in enumerate(datasets):
        points = ds.get("points", [])
        name = ds.get("name", f"Series {i + 1}")
        xs = [p.get("x", 0) for p in points]
        ys = [p.get("y", 0) for p in points]
        sizes = [p.get("size", 30) for p in points]
        ax.scatter(xs, ys, s=sizes, color=colors[i], label=name, alpha=0.7, edgecolors="white", linewidth=0.5)

    return _finalize_figure(
        fig, ax,
        show_legend=options.get("show_legend", len(datasets) > 1),
        show_grid=options.get("show_grid", True),
        x_label=options.get("x_label", ""),
        y_label=options.get("y_label", ""),
    )


def _render_radar(data: dict, options: dict) -> str:
    """Render a radar/spider chart."""
    labels = data.get("labels", [])
    datasets = data.get("datasets", [])
    palette = options.get("color_palette", "neon")

    n = len(labels)
    if n < 3:
        raise ValueError("Radar chart needs at least 3 labels")

    angles = [i / n * 2 * math.pi for i in range(n)]
    angles += angles[:1]  # Close the polygon

    fig, ax = plt.subplots(figsize=(FIG_WIDTH, FIG_HEIGHT), subplot_kw={"polar": True})
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor(BG_COLOR)

    colors = _get_colors(palette, len(datasets))

    for i, ds in enumerate(datasets):
        values = ds.get("values", [])
        values = values + values[:1]  # Close the polygon
        name = ds.get("name", f"Series {i + 1}")
        ax.plot(angles, values, color=colors[i], linewidth=2, label=name)
        ax.fill(angles, values, color=colors[i], alpha=0.15)

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, color=TEXT_COLOR, fontsize=9)
    ax.tick_params(axis="y", colors=MUTED_COLOR)
    ax.spines["polar"].set_color(GRID_COLOR)
    ax.grid(color=GRID_COLOR, alpha=0.3)

    if options.get("title"):
        ax.set_title(options["title"], color=TEXT_COLOR, fontsize=14, fontweight="bold", pad=20)

    if options.get("show_legend", len(datasets) > 1):
        legend = ax.legend(
            loc="upper right",
            bbox_to_anchor=(1.3, 1.1),
            facecolor=BG_COLOR,
            edgecolor=GRID_COLOR,
            labelcolor=TEXT_COLOR,
            fontsize=9,
        )
        legend.get_frame().set_alpha(0.8)

    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=FIG_DPI, facecolor=BG_COLOR, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)

    b64 = base64.b64encode(buf.read()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def _render_heatmap(data: dict, options: dict) -> str:
    """Render a heatmap."""
    x_labels = data.get("x_labels", [])
    y_labels = data.get("y_labels", [])
    values = data.get("values", [])
    palette = options.get("color_palette", "neon")

    fig, ax = _setup_figure(options.get("title", ""), options.get("subtitle", ""))

    arr = np.array(values)
    cmap = "cool" if palette in ("cool", "monochrome") else "YlOrRd" if palette == "warm" else "viridis"

    im = ax.imshow(arr, cmap=cmap, aspect="auto")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

    ax.set_xticks(range(len(x_labels)))
    ax.set_xticklabels(x_labels, color=TEXT_COLOR, fontsize=9, rotation=45, ha="right")
    ax.set_yticks(range(len(y_labels)))
    ax.set_yticklabels(y_labels, color=TEXT_COLOR, fontsize=9)

    if options.get("show_values", True):
        for i in range(len(y_labels)):
            for j in range(len(x_labels)):
                if i < arr.shape[0] and j < arr.shape[1]:
                    val = arr[i, j]
                    text_color = "white" if val < arr.max() * 0.6 else "black"
                    ax.text(j, i, f"{val:g}", ha="center", va="center", color=text_color, fontsize=8)

    return _finalize_figure(fig, ax, show_legend=False, show_grid=False, glow=False)


def _render_metric(data: dict, options: dict) -> str:
    """Render a KPI metric card."""
    value = data.get("value", "0")
    label = data.get("label", "Metric")
    delta = data.get("delta", "")
    delta_direction = data.get("delta_direction", "")

    fig, ax = plt.subplots(figsize=(5, 3))
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor(BG_COLOR)
    ax.axis("off")

    # Main value
    ax.text(0.5, 0.55, str(value), ha="center", va="center", color="#08F7FE", fontsize=42, fontweight="bold", transform=ax.transAxes)

    # Label
    ax.text(0.5, 0.2, label, ha="center", va="center", color=TEXT_COLOR, fontsize=14, transform=ax.transAxes)

    # Delta
    if delta:
        delta_color = "#00FF88" if delta_direction == "up" else "#FF6B6B" if delta_direction == "down" else MUTED_COLOR
        arrow = "\u25b2" if delta_direction == "up" else "\u25bc" if delta_direction == "down" else ""
        ax.text(0.5, 0.82, f"{arrow} {delta}", ha="center", va="center", color=delta_color, fontsize=14, transform=ax.transAxes)

    if options.get("title"):
        ax.set_title(options["title"], color=TEXT_COLOR, fontsize=12, fontweight="bold", pad=10)

    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=FIG_DPI, facecolor=BG_COLOR, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)

    b64 = base64.b64encode(buf.read()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


# Chart type dispatcher
RENDERERS = {
    "bar": _render_bar,
    "line": _render_line,
    "area": _render_area,
    "pie": lambda d, o: _render_pie(d, o, donut=False),
    "donut": lambda d, o: _render_pie(d, o, donut=True),
    "scatter": _render_scatter,
    "radar": _render_radar,
    "heatmap": _render_heatmap,
    "metric": _render_metric,
}


async def generate_chart(
    chart_type: str,
    data: dict | None = None,
    options: dict | None = None,
    **kwargs,
) -> dict:
    """Generate a chart and return it via the _image side-channel.

    Args:
        chart_type: One of bar, line, pie, donut, scatter, area, radar, heatmap, metric
        data: Chart data (labels, datasets, values, etc.)
        options: Display options (title, subtitle, palette, etc.)

    Returns:
        Dict with success status and _image containing base64 data URL.
    """
    data = data or {}
    options = options or {}

    renderer = RENDERERS.get(chart_type)
    if not renderer:
        return {"error": f"Unknown chart type: {chart_type}. Supported: {', '.join(RENDERERS.keys())}"}

    try:
        image_data_url = renderer(data, options)
        return {
            "success": True,
            "message": f"{chart_type.title()} chart generated successfully.",
            "_image": image_data_url,
        }
    except Exception as e:
        logger.error(f"Chart generation failed: {e}", exc_info=True)
        return {"error": f"Chart generation failed: {str(e)}"}

"""Media handlers for Discord messages: tables, code blocks, and LaTeX rendering.

Tables render with proper inline markdown — `**bold**`, `*italic*`,
`` `code` `` spans use distinct fonts. Code spans use IBM Plex Mono;
the rest uses Noto Sans (variable axis weight via Pillow).
"""

import io
import logging
import re
import urllib.parse
from pathlib import Path

import discord

logger = logging.getLogger(__name__)

# =============================================================================
# OPTIONAL DEPENDENCIES - Graceful fallback if not installed
# =============================================================================
try:
    from PIL import Image, ImageDraw, ImageFont
    from pilmoji import Pilmoji

    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    logger.warning("PIL/pilmoji not installed - table rendering disabled")

try:
    import cairosvg
    import requests

    LATEX_AVAILABLE = True
except ImportError:
    LATEX_AVAILABLE = False
    logger.warning("cairosvg/requests not installed - LaTeX rendering disabled")


# =============================================================================
# LATEX HANDLER
# =============================================================================

LATEX_TO_EMOJI = {
    # Greek lowercase
    r"\alpha": "α",
    r"\beta": "β",
    r"\gamma": "γ",
    r"\delta": "δ",
    r"\epsilon": "ε",
    r"\zeta": "ζ",
    r"\eta": "η",
    r"\theta": "θ",
    r"\iota": "ι",
    r"\kappa": "κ",
    r"\lambda": "λ",
    r"\mu": "μ",
    r"\nu": "ν",
    r"\xi": "ξ",
    r"\pi": "π",
    r"\rho": "ρ",
    r"\sigma": "σ",
    r"\tau": "τ",
    r"\upsilon": "υ",
    r"\phi": "φ",
    r"\chi": "χ",
    r"\psi": "ψ",
    r"\omega": "ω",
    # Greek uppercase
    r"\Gamma": "Γ",
    r"\Delta": "Δ",
    r"\Theta": "Θ",
    r"\Lambda": "Λ",
    r"\Xi": "Ξ",
    r"\Pi": "Π",
    r"\Sigma": "Σ",
    r"\Upsilon": "Υ",
    r"\Phi": "Φ",
    r"\Psi": "Ψ",
    r"\Omega": "Ω",
    # Operators
    r"\sum": "∑",
    r"\prod": "∏",
    r"\int": "∫",
    r"\partial": "∂",
    r"\nabla": "∇",
    r"\infty": "∞",
    r"\forall": "∀",
    r"\exists": "∃",
    r"\times": "×",
    r"\div": "÷",
    r"\pm": "±",
    r"\cdot": "⋅",
    # Relations
    r"\leq": "≤",
    r"\geq": "≥",
    r"\neq": "≠",
    r"\approx": "≈",
    r"\equiv": "≡",
    r"\sim": "∼",
    r"\perp": "⊥",
    r"\parallel": "∥",
    # Arrows
    r"\leftarrow": "←",
    r"\rightarrow": "→",
    r"\Leftarrow": "⇐",
    r"\Rightarrow": "⇒",
    r"\leftrightarrow": "↔",
    r"\Leftrightarrow": "⇔",
}

LATEX_PATTERN = re.compile(
    r"```(?:latex|tex)[^\`]*?```|"
    r"\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}|"
    r"\$\$[\s\S]*?\$\$|"
    r"\\\[[\s\S]*?\\\]|"
    r"\$[^$][\s\S]*?\$|"
    r"\\(?:begin|end)\{(?:equation|align|gather|multline)\*?\}|"
    r"\\frac\{.*?\}\{.*?\}|"
    r"\\sqrt\{.*?\}|"
    r"\\text\{.*?\}|"
    r"\\[a-zA-Z]+",
    flags=re.DOTALL,
)


def _latex_to_svg(formula: str) -> bytes:
    if not LATEX_AVAILABLE:
        return b""
    try:
        encoded = urllib.parse.quote(formula, safe="")
        url = f"https://math.vercel.app?color=white&from={encoded}.svg"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return response.content
    except Exception as e:
        logger.error(f"Failed to fetch SVG for LaTeX: {e}")
        return b""


def _svg_to_png(svg_data: bytes) -> bytes:
    if not LATEX_AVAILABLE or not svg_data:
        return b""
    try:
        return cairosvg.svg2png(bytestring=svg_data, scale=1)
    except Exception as e:
        logger.error(f"Failed to convert SVG to PNG: {e}")
        return b""


async def convert_latex_to_png(latex: str) -> tuple[io.BytesIO | str, bool]:
    if not LATEX_AVAILABLE:
        return f"LaTeX rendering unavailable. Use: $${latex}$$", True

    try:
        latex = latex.strip()

        if latex.startswith("```") and latex.endswith("```"):
            lines = latex.split("\n")
            if len(lines) >= 3 and lines[-1] == "```":
                latex = "\n".join(lines[1:-1])
            else:
                return "Invalid fenced code block", False

        if latex.startswith("$$") and latex.endswith("$$"):
            latex = latex[2:-2]
        elif latex.startswith("$") and latex.endswith("$"):
            latex = latex[1:-1]
        elif latex.startswith(r"\[") and latex.endswith(r"\]"):
            latex = latex[2:-2]

        svg_bytes = _latex_to_svg(latex)
        if not svg_bytes:
            return f"```\n${latex}$\n```", True

        png_bytes = _svg_to_png(svg_bytes)
        if not png_bytes:
            return f"```\n${latex}$\n```", True

        buffer = io.BytesIO(png_bytes)
        buffer.seek(0)
        return buffer, True

    except Exception as e:
        logger.error(f"LaTeX conversion failed: {e}")
        return f"```\n${latex}$\n```", True


def detect_latex(text: str) -> list[str]:
    return LATEX_PATTERN.findall(text)


# =============================================================================
# TABLE HANDLER
# =============================================================================
#
# Visual spec — calibrated for Discord dark mode at 150 DPI:
#   font_size=20pt, padding=10px, header_height=48px, min_cell_height=42px
#   row banding #313338 / #383a40, border #40444b
# Inline markdown spans (**bold**, *italic*, `code`) render via per-span
# drawing — measure each segment's width with its own font, dispatch the
# correct font weight at draw time, accumulate x-offset.

URL_REGEX = r"\[([^\]]+)\]\((https?://[^\s\)]+)\)|(https?://[^\s\)]+)"
COLUMN_MAX_WIDTH = 900

# Style constants
FONT_SIZE = 20
HEADER_FONT_SIZE = 22
PADDING = 14
HEADER_HEIGHT = 56
MIN_CELL_HEIGHT = 44
LINE_HEIGHT_RATIO = 1.35
OUTPUT_DPI = 150

# Discord dark palette (hex → RGB tuples)
PALETTE = {
    "bg": (49, 51, 56),  # #313338  base background
    "header_bg": (43, 45, 49),  # #2b2d31  header strip
    "row_bg": (49, 51, 56),  # #313338  row even
    "row_bg_alt": (56, 58, 64),  # #383a40  row odd (banding)
    "border": (64, 68, 75),  # #40444b  cell borders
    "text": (220, 221, 222),  # #dcddde  body text
    "header_text": (255, 255, 255),  # #ffffff  header text
    "code_bg": (32, 34, 37),  # #202225  inline-code chip
    "code_text": (220, 221, 222),  # #dcddde  code text
}

# Variable-font weight axis values
WGHT_REGULAR = 400
WGHT_BOLD = 700


def _font_path(filename: str) -> Path:
    """Resolve a font under apps/polly/assets/fonts/."""
    return Path(__file__).parent.parent.parent / "assets" / "fonts" / filename


def _load_variation(path: Path, size: int, wght: int):
    """Load a variable TTF and apply the wght axis."""
    if not PIL_AVAILABLE:
        return None
    try:
        font = ImageFont.truetype(str(path), size)
        try:
            font.set_variation_by_axes([wght])
        except (OSError, AttributeError):
            # Static font (no variation axes) — silent fall-through.
            pass
        return font
    except Exception as e:
        logger.warning(f"Failed to load font {path.name}: {e}")
        return None


def _load_static(path: Path, size: int):
    """Load a static TTF."""
    if not PIL_AVAILABLE:
        return None
    try:
        return ImageFont.truetype(str(path), size)
    except Exception as e:
        logger.warning(f"Failed to load font {path.name}: {e}")
        return None


def _build_fontset(size: int = FONT_SIZE) -> dict:
    """Return a dict of style -> ImageFont, with default-bitmap fallback."""
    if not PIL_AVAILABLE:
        return {}

    noto_vf = _font_path("NotoSans-VF.ttf")
    noto_italic_vf = _font_path("NotoSans-Italic-VF.ttf")
    plex_reg = _font_path("IBMPlexMono-Regular.ttf")
    plex_bold = _font_path("IBMPlexMono-Bold.ttf")

    default = ImageFont.load_default()

    return {
        "regular": _load_variation(noto_vf, size, WGHT_REGULAR) or default,
        "bold": _load_variation(noto_vf, size, WGHT_BOLD) or default,
        "italic": _load_variation(noto_italic_vf, size, WGHT_REGULAR) or default,
        "bold_italic": _load_variation(noto_italic_vf, size, WGHT_BOLD) or default,
        "code": _load_static(plex_reg, size) or default,
        "code_bold": _load_static(plex_bold, size) or default,
    }


# Inline-formatting parser
# Spans matched: ``code``, **bold**, *italic*, __underline__, ***bolditalic***
_INLINE_PATTERN = re.compile(r"(`[^`]+`|\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|\*[^*]+?\*|__[^_]+?__)")


def _parse_inline(text: str) -> list[tuple[dict, str]]:
    """Split text into (style, content) segments. Style: bold/italic/code/underline."""
    parts = _INLINE_PATTERN.split(text)
    segments = []
    for part in parts:
        if not part:
            continue
        style = {"bold": False, "italic": False, "code": False, "underline": False}
        content = part

        if part.startswith("`") and part.endswith("`") and len(part) >= 2:
            style["code"] = True
            content = part[1:-1]
        elif part.startswith("***") and part.endswith("***") and len(part) >= 6:
            style["bold"] = True
            style["italic"] = True
            content = part[3:-3]
        elif part.startswith("**") and part.endswith("**") and len(part) >= 4:
            style["bold"] = True
            content = part[2:-2]
        elif part.startswith("*") and part.endswith("*") and len(part) >= 2:
            style["italic"] = True
            content = part[1:-1]
        elif part.startswith("__") and part.endswith("__") and len(part) >= 4:
            style["underline"] = True
            content = part[2:-2]

        segments.append((style, content))
    return segments


def _segment_font(fonts: dict, style: dict):
    """Pick the right font variant for a parsed segment style."""
    if style.get("code"):
        return fonts["code_bold"] if style.get("bold") else fonts["code"]
    if style.get("bold") and style.get("italic"):
        return fonts["bold_italic"]
    if style.get("bold"):
        return fonts["bold"]
    if style.get("italic"):
        return fonts["italic"]
    return fonts["regular"]


def _extract_links_and_sanitize(text: str, current_links: list[str]) -> tuple[str, list[str]]:
    """Substitute URLs into placeholders and return sanitized text + links."""

    def replacer(match):
        label, url_md, url_plain = match.groups()
        url = url_md or url_plain

        if url in current_links:
            idx = current_links.index(url) + 1
        else:
            current_links.append(url)
            idx = len(current_links)

        domain = urllib.parse.urlparse(url).netloc
        if domain.startswith("www."):
            domain = domain[4:]

        return f"[{idx}] ({domain})"

    sanitized_text = re.sub(URL_REGEX, replacer, text)
    return sanitized_text, current_links


def _segment_widths(segments: list[tuple[dict, str]], fonts: dict, draw: ImageDraw.ImageDraw) -> int:
    """Sum pixel width of all segments using their per-style fonts."""
    total = 0
    for style, content in segments:
        font = _segment_font(fonts, style)
        total += int(draw.textlength(content, font=font))
        if style.get("code"):
            total += 6  # padding for the chip background
    return total


def _calc_col_widths(
    headers: list[str], rows: list[list[str]], header_fonts: dict, body_fonts: dict, padding: int
) -> list[int]:
    """Calculate column widths using per-segment measurement."""
    if not PIL_AVAILABLE:
        return [COLUMN_MAX_WIDTH] * len(headers)

    img = Image.new("RGB", (1, 1))
    draw = ImageDraw.Draw(img)
    widths = []

    for i, header in enumerate(headers):
        header_segs = _parse_inline(str(header))
        max_w = _segment_widths(header_segs, header_fonts, draw) + padding * 2

        for row in rows:
            if i < len(row):
                cell_segs = _parse_inline(str(row[i]))
                cell_w = _segment_widths(cell_segs, body_fonts, draw) + padding * 2
                if cell_w > max_w:
                    max_w = cell_w

        widths.append(int(min(max_w, COLUMN_MAX_WIDTH)))

    return widths


def _draw_segment_run(
    pilmoji: "Pilmoji",
    draw: ImageDraw.ImageDraw,
    segments: list[tuple[dict, str]],
    x: int,
    y_baseline: int,
    fonts: dict,
    text_color: tuple,
    line_height: int,
):
    """Draw a list of styled segments left-to-right starting at (x, y_baseline).

    Code segments get a subtle filled background pill behind them.
    """
    cur_x = x
    for style, content in segments:
        font = _segment_font(fonts, style)
        seg_w = int(draw.textlength(content, font=font))

        if style.get("code"):
            chip_pad_x = 4
            # Approximate cap-height + descent for the chip box
            chip_top = y_baseline - int(line_height * 0.55)
            chip_bot = y_baseline + int(line_height * 0.20)
            draw.rectangle(
                [cur_x - chip_pad_x, chip_top, cur_x + seg_w + chip_pad_x, chip_bot],
                fill=PALETTE["code_bg"],
            )
            color = PALETTE["code_text"]
        else:
            color = text_color

        # Pilmoji draws emoji-aware text. anchor="lm" = left, vertical middle.
        pilmoji.text((cur_x, y_baseline), content, font=font, fill=color, anchor="lm")

        if style.get("underline"):
            ul_y = y_baseline + int(line_height * 0.30)
            draw.line([cur_x, ul_y, cur_x + seg_w, ul_y], fill=color, width=max(1, FONT_SIZE // 14))

        cur_x += seg_w
        if style.get("code"):
            cur_x += 6  # post-chip gap


async def render_table_image(
    headers: list[str],
    rows: list[list[str]],
    alignments: list[str] | None = None,
) -> tuple[io.BytesIO | None, list[str]]:
    """Render a markdown-aware table as a PNG. Returns (buffer, extracted_links)."""
    if not PIL_AVAILABLE:
        logger.warning("PIL not available - skipping table rendering")
        return None, []

    try:
        all_links: list[str] = []

        sanitized_headers = []
        for h in headers:
            text, all_links = _extract_links_and_sanitize(str(h), all_links)
            sanitized_headers.append(text)

        sanitized_rows = []
        for row in rows:
            sanitized_row = []
            for cell in row:
                text, all_links = _extract_links_and_sanitize(str(cell), all_links)
                sanitized_row.append(text)
            sanitized_rows.append(sanitized_row)

        body_fonts = _build_fontset(FONT_SIZE)
        header_fonts = _build_fontset(HEADER_FONT_SIZE)
        # Headers default-bold even without explicit `**...**` markup.
        header_fonts["regular"] = header_fonts["bold"]
        header_fonts["italic"] = header_fonts["bold_italic"]

        line_height = int(FONT_SIZE * LINE_HEIGHT_RATIO)
        col_widths = _calc_col_widths(sanitized_headers, sanitized_rows, header_fonts, body_fonts, PADDING)

        total_width = sum(col_widths) + len(col_widths) + 1
        total_height = HEADER_HEIGHT + len(sanitized_rows) * MIN_CELL_HEIGHT + len(sanitized_rows) + 1

        img = Image.new("RGB", (total_width, total_height), PALETTE["bg"])

        with Pilmoji(img) as pilmoji:
            draw = ImageDraw.Draw(img)

            # Header row
            x = 0
            for header, width in zip(sanitized_headers, col_widths):
                draw.rectangle(
                    [x, 0, x + width, HEADER_HEIGHT],
                    fill=PALETTE["header_bg"],
                    outline=PALETTE["border"],
                )
                segs = _parse_inline(str(header))
                _draw_segment_run(
                    pilmoji,
                    draw,
                    segs,
                    x + PADDING,
                    HEADER_HEIGHT // 2,
                    header_fonts,
                    PALETTE["header_text"],
                    int(HEADER_FONT_SIZE * LINE_HEIGHT_RATIO),
                )
                x += width + 1

            # Data rows
            y = HEADER_HEIGHT + 1
            for row_idx, row in enumerate(sanitized_rows):
                row_bg = PALETTE["row_bg_alt"] if row_idx % 2 else PALETTE["row_bg"]
                x = 0
                for cell, width in zip(row, col_widths):
                    draw.rectangle(
                        [x, y, x + width, y + MIN_CELL_HEIGHT],
                        fill=row_bg,
                        outline=PALETTE["border"],
                    )
                    segs = _parse_inline(str(cell))
                    _draw_segment_run(
                        pilmoji,
                        draw,
                        segs,
                        x + PADDING,
                        y + MIN_CELL_HEIGHT // 2,
                        body_fonts,
                        PALETTE["text"],
                        line_height,
                    )
                    x += width + 1
                y += MIN_CELL_HEIGHT + 1

        buffer = io.BytesIO()
        img.save(buffer, format="PNG", dpi=(OUTPUT_DPI, OUTPUT_DPI))
        buffer.seek(0)
        return buffer, all_links

    except Exception as e:
        logger.error(f"Table rendering failed: {e}", exc_info=True)
        return None, []


def detect_and_parse_markdown_tables(
    text: str,
) -> tuple[str, list[tuple[list[str], list[list[str]], list[str]]]]:
    """Detect markdown tables. Returns (text-with-table-lines-removed, tables)."""
    tables = []
    lines = text.split("\n")
    output_lines = []
    i = 0

    while i < len(lines):
        line = lines[i].strip()

        if line.startswith("|") and line.endswith("|"):
            headers = [p.strip() for p in line[1:-1].split("|")]
            num_cols = len(headers)

            if i + 1 < len(lines):
                sep_line = lines[i + 1].strip()
                if sep_line.startswith("|") and sep_line.endswith("|"):
                    sep_parts = [p.strip() for p in sep_line[1:-1].split("|")]
                    alignments = []
                    for sep in sep_parts:
                        if sep.startswith(":") and sep.endswith(":"):
                            alignments.append("center")
                        elif sep.endswith(":"):
                            alignments.append("right")
                        elif sep.startswith(":"):
                            alignments.append("left")
                        else:
                            alignments.append("left")

                    # Empty separator parts (no dashes) → not a real table.
                    if not all(set(s) <= set(":-") and "-" in s for s in sep_parts):
                        output_lines.append(lines[i])
                        i += 1
                        continue

                    rows = []
                    j = i + 2
                    while j < len(lines):
                        row_line = lines[j].strip()
                        if not row_line.startswith("|") or not row_line.endswith("|"):
                            break
                        row = [p.strip() for p in row_line[1:-1].split("|")]
                        # Auto-pad short rows; truncate over-long ones.
                        if len(row) < num_cols:
                            row = row + [""] * (num_cols - len(row))
                        elif len(row) > num_cols:
                            row = row[:num_cols]
                        rows.append(row)
                        j += 1

                    if rows:
                        tables.append((headers, rows, alignments))
                        i = j
                        # Drop the original markdown lines entirely; the
                        # caller renders the table as an image and the raw
                        # asterisks would have looked wrong anyway.
                        continue

        output_lines.append(lines[i])
        i += 1

    return "\n".join(output_lines), tables


# =============================================================================
# CODE BLOCK HANDLER
# =============================================================================


async def send_code_block(
    channel: discord.Thread | discord.TextChannel,
    code_block: str,
    max_length: int = 2000,
):
    """Send a fenced code block, splitting across messages without breaking lines."""
    first_line_end = code_block.find("\n")
    if first_line_end == -1:
        language = ""
        code = code_block[3:-3] if code_block.startswith("```") else code_block
    else:
        language = code_block[3:first_line_end].strip()
        code = code_block[first_line_end + 1 : -3] if code_block.endswith("```") else code_block[first_line_end + 1 :]

    code_lines = code.splitlines(keepends=True)
    code_prefix = f"```{language}\n" if language else "```"
    code_suffix = "```"
    current_code = code_prefix

    for line in code_lines:
        if len(current_code) + len(line) + len(code_suffix) > max_length:
            current_code += code_suffix
            await channel.send(current_code)
            current_code = code_prefix
        current_code += line

    if len(current_code) > len(code_prefix):
        current_code += code_suffix
        await channel.send(current_code)

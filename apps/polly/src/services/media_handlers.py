"""Media handlers for Discord messages: tables, code blocks, and LaTeX rendering."""

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
    r"\alpha": "α", r"\beta": "β", r"\gamma": "γ", r"\delta": "δ",
    r"\epsilon": "ε", r"\zeta": "ζ", r"\eta": "η", r"\theta": "θ",
    r"\iota": "ι", r"\kappa": "κ", r"\lambda": "λ", r"\mu": "μ",
    r"\nu": "ν", r"\xi": "ξ", r"\pi": "π", r"\rho": "ρ",
    r"\sigma": "σ", r"\tau": "τ", r"\upsilon": "υ", r"\phi": "φ",
    r"\chi": "χ", r"\psi": "ψ", r"\omega": "ω",
    # Greek uppercase
    r"\Gamma": "Γ", r"\Delta": "Δ", r"\Theta": "Θ", r"\Lambda": "Λ",
    r"\Xi": "Ξ", r"\Pi": "Π", r"\Sigma": "Σ", r"\Upsilon": "Υ",
    r"\Phi": "Φ", r"\Psi": "Ψ", r"\Omega": "Ω",
    # Operators
    r"\sum": "∑", r"\prod": "∏", r"\int": "∫", r"\partial": "∂",
    r"\nabla": "∇", r"\infty": "∞", r"\forall": "∀", r"\exists": "∃",
    r"\times": "×", r"\div": "÷", r"\pm": "±", r"\cdot": "⋅",
    # Relations
    r"\leq": "≤", r"\geq": "≥", r"\neq": "≠", r"\approx": "≈",
    r"\equiv": "≡", r"\sim": "∼", r"\perp": "⊥", r"\parallel": "∥",
    # Arrows
    r"\leftarrow": "←", r"\rightarrow": "→", r"\Leftarrow": "⇐",
    r"\Rightarrow": "⇒", r"\leftrightarrow": "↔", r"\Leftrightarrow": "⇔",
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
    """Fetch SVG for LaTeX formula via math.vercel.app."""
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
    """Convert SVG bytes to PNG bytes."""
    if not LATEX_AVAILABLE or not svg_data:
        return b""
    try:
        return cairosvg.svg2png(bytestring=svg_data, scale=1)
    except Exception as e:
        logger.error(f"Failed to convert SVG to PNG: {e}")
        return b""


async def convert_latex_to_png(latex: str) -> tuple[io.BytesIO | str, bool]:
    """
    Convert LaTeX string to PNG image.

    Args:
        latex: LaTeX formula to convert

    Returns:
        (buffer or error message, success boolean)
    """
    if not LATEX_AVAILABLE:
        return f"LaTeX rendering unavailable. Use: $${latex}$$", True

    try:
        latex = latex.strip()

        # Handle fenced code blocks
        if latex.startswith("```") and latex.endswith("```"):
            lines = latex.split("\n")
            if len(lines) >= 3 and lines[-1] == "```":
                latex = "\n".join(lines[1:-1])
            else:
                return "Invalid fenced code block", False

        # Remove delimiters
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
    """Detect LaTeX expressions in text."""
    return LATEX_PATTERN.findall(text)


# =============================================================================
# TABLE HANDLER
# =============================================================================

URL_REGEX = r'\[([^\]]+)\]\((https?://[^\s\)]+)\)|(https?://[^\s\)]+)'
EMOJI_BUFFER = 12
SEGMENT_GAP = "  "
COLUMN_MAX_WIDTH = 1200


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


def _get_font(size: int, bold: bool = False, italic: bool = False):
    """Load Noto Sans font or fallback to default."""
    if not PIL_AVAILABLE:
        return None
    try:
        # Construct absolute path from module location
        module_dir = Path(__file__).parent.parent.parent  # /apps/polly/
        fonts_dir = module_dir / "assets" / "fonts"

        if bold and italic:
            font_name = "NotoSans-BoldItalic.ttf"
        elif bold:
            font_name = "NotoSans-Bold.ttf"
        elif italic:
            font_name = "NotoSans-Italic.ttf"
        else:
            font_name = "NotoSans-Regular.ttf"

        path = fonts_dir / font_name

        if not path.exists():
            logger.warning(f"Font not found: {path}, using default")
            return ImageFont.load_default()

        return ImageFont.truetype(str(path), size)
    except Exception as e:
        logger.warning(f"Failed to load font: {e}, using default")
        return ImageFont.load_default()


def _calc_col_widths(headers: list[str], rows: list[list[str]], font, padding: int) -> list[int]:
    """Calculate column widths based on content and font."""
    if not PIL_AVAILABLE:
        return [COLUMN_MAX_WIDTH] * len(headers)

    img = Image.new("RGB", (1, 1))
    widths = []

    with Pilmoji(img) as pilmoji:
        for i, header in enumerate(headers):
            max_w = pilmoji.draw.textlength(str(header), font=font) + padding * 2

            for row in rows:
                if i < len(row):
                    cell_w = pilmoji.draw.textlength(str(row[i]), font=font) + padding * 2
                    max_w = max(max_w, cell_w)

            widths.append(int(min(max_w, COLUMN_MAX_WIDTH)))

    return widths


def _parse_text_formatting(text: str) -> list[tuple[dict, str]]:
    """Parse text with **bold**, *italic*, __underline__ formatting."""
    pattern = r"(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|__.*?__)"
    parts = re.split(pattern, text)
    segments = []

    for part in parts:
        if not part:
            continue

        style = {"bold": False, "italic": False, "underline": False}
        content = part

        if part.startswith("***") and part.endswith("***"):
            style["bold"] = style["italic"] = True
            content = part[3:-3]
        elif part.startswith("**") and part.endswith("**"):
            style["bold"] = True
            content = part[2:-2]
        elif part.startswith("*") and part.endswith("*"):
            style["italic"] = True
            content = part[1:-1]
        elif part.startswith("__") and part.endswith("__"):
            style["underline"] = True
            content = part[2:-2]

        segments.append((style, content))

    return segments


async def render_table_image(
    headers: list[str], rows: list[list[str]], alignments: list[str] | None = None
) -> tuple[io.BytesIO | None, list[str]]:
    """
    Render table as a PNG image.

    Returns:
        (image_buffer, extracted_links)
    """
    if not PIL_AVAILABLE:
        logger.warning("PIL not available - skipping table rendering")
        return None, []

    try:
        all_links = []

        # Sanitize content
        sanitized_headers = []
        for h in headers:
            text, all_links = _extract_links_and_sanitize(h, all_links)
            sanitized_headers.append(text)

        sanitized_rows = []
        for row in rows:
            sanitized_row = []
            for cell in row:
                text, all_links = _extract_links_and_sanitize(str(cell), all_links)
                sanitized_row.append(text)
            sanitized_rows.append(sanitized_row)

        # Setup fonts and colors
        font_size = 42
        fonts = {
            "reg_reg": _get_font(font_size),
            "bold_reg": _get_font(font_size, bold=True),
            "reg_italic": _get_font(font_size, italic=True),
            "bold_italic": _get_font(font_size, bold=True, italic=True),
            "header_reg": _get_font(font_size + 6),
            "header_bold": _get_font(font_size + 6, bold=True),
            "cell": _get_font(font_size),
            "line_height": font_size + 12,
        }

        colors = {
            "bg": (7, 7, 9),
            "header_bg": (28, 28, 32),
            "row_bg": (7, 7, 9),
            "row_bg_alt": (28, 28, 32),
            "border": (60, 60, 65),
            "text": (255, 255, 255),
        }

        padding = 36
        header_height = 120
        min_cell_height = 84

        col_widths = _calc_col_widths(sanitized_headers, sanitized_rows, fonts["reg_reg"], padding)

        total_width = sum(col_widths) + len(col_widths) + 1
        total_height = header_height + len(sanitized_rows) * min_cell_height + len(sanitized_rows) + 1

        img = Image.new("RGB", (total_width, total_height), colors["bg"])

        with Pilmoji(img) as pilmoji:
            draw = ImageDraw.Draw(img)

            # Draw header
            x = 0
            for header, width in zip(sanitized_headers, col_widths):
                draw.rectangle([x, 0, x + width, header_height], fill=colors["header_bg"], outline=colors["border"])
                pilmoji.text((x + padding, header_height // 2), str(header), font=fonts["header_reg"], fill=colors["text"], anchor="lm")
                x += width + 1

            # Draw rows
            y = header_height + 1
            for row_idx, row in enumerate(sanitized_rows):
                x = 0
                row_bg = colors["row_bg_alt"] if row_idx % 2 else colors["row_bg"]
                for cell, width in zip(row, col_widths):
                    draw.rectangle([x, y, x + width, y + min_cell_height], fill=row_bg, outline=colors["border"])
                    pilmoji.text((x + padding, y + min_cell_height // 2), str(cell), font=fonts["cell"], fill=colors["text"], anchor="lm")
                    x += width + 1
                y += min_cell_height + 1

        buffer = io.BytesIO()
        img.save(buffer, format="PNG", dpi=(300, 300))
        buffer.seek(0)

        return buffer, all_links

    except Exception as e:
        logger.error(f"Table rendering failed: {e}")
        return None, []


def detect_and_parse_markdown_tables(text: str) -> tuple[str, list[tuple[list[str], list[list[str]], list[str]]]]:
    """
    Detect and parse markdown tables.

    Returns:
        (modified_text, list_of_tables) where table = (headers, rows, alignments)
    """
    tables = []
    lines = text.split("\n")
    output_lines = []
    i = 0

    while i < len(lines):
        line = lines[i].strip()

        # Check if line is start of table
        if line.startswith("|") and line.endswith("|"):
            # Try to parse as table header
            headers = [p.strip() for p in line.strip()[1:-1].split("|")]
            num_cols = len(headers)

            # Look for separator on next line
            if i + 1 < len(lines):
                sep_line = lines[i + 1].strip()
                if sep_line.startswith("|") and sep_line.endswith("|"):
                    sep_parts = [p.strip() for p in sep_line[1:-1].split("|")]

                    # Parse alignments from separator
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

                    # Collect rows
                    rows = []
                    j = i + 2
                    while j < len(lines):
                        row_line = lines[j].strip()
                        if not row_line.startswith("|") or not row_line.endswith("|"):
                            break
                        row = [p.strip() for p in row_line[1:-1].split("|")]
                        if len(row) == num_cols:
                            rows.append(row)
                        j += 1

                    if rows:
                        tables.append((headers, rows, alignments))
                        output_lines.append("__TABLE_IMG__")
                        i = j
                        continue

        output_lines.append(lines[i])
        i += 1

    return "\n".join(output_lines), tables


# =============================================================================
# CODE BLOCK HANDLER
# =============================================================================

async def send_code_block(channel: discord.Thread | discord.TextChannel, code_block: str, max_length: int = 2000):
    """Send code block, splitting into multiple if needed without breaking lines."""
    # Extract language and code
    first_line_end = code_block.find("\n")
    if first_line_end == -1:
        language = ""
        code = code_block[3:-3] if code_block.startswith("```") else code_block
    else:
        language = code_block[3:first_line_end].strip()
        code = code_block[first_line_end + 1:-3] if code_block.endswith("```") else code_block[first_line_end + 1:]

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

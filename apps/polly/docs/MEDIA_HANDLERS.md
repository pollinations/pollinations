# Polly Media Handlers — Production deployment

Renders Markdown tables, LaTeX expressions, code blocks, and charts (bar / line / pie / heatmap / etc.) as PNG images attached to Discord messages.

## Components

- `src/services/media_handlers.py` — PIL-based table renderer, LaTeX→PNG, code-block splitter
- `src/services/chart_renderer.py` — matplotlib + seaborn chart engine
- `src/services/charts.py` — `render_visual` tool handler that dispatches to the above
- `assets/fonts/` — vendored Noto Sans (variable axis) + IBM Plex Mono TTFs

## Prerequisites

- Python 3.10+
- System packages required by `cairosvg` (libcairo2, libpangocairo) for LaTeX SVG→PNG

## Setup

1. Create and activate a virtualenv:

   ```bash
   cd apps/polly
   python -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Start the bot:

   ```bash
   python main.py
   ```

For production, run under systemd / supervisord / docker with env vars supplied securely.

## How the AI uses it

The AI calls a single tool, `render_visual(type, title, data, options)`. Internally:

| Path | Trigger |
|---|---|
| Local PIL renderer    | `type="table"` |
| Local matplotlib/seaborn | `type` in `bar / horizontal_bar / line / area / scatter / pie / donut / heatmap / histogram` |
| Gemini code-execution | `type="free_form"` or any unrecognized type |

Multiple `render_visual` calls in one turn attach multiple images (Discord caps at 10 per message).

## Notes

- Fonts ship in `assets/fonts/`; no separate download step is needed.
- If the font files are missing for any reason, PIL falls back to the bitmap default (degraded but functional).
- Markdown tables that the AI emits in plain text are still detected post-hoc by `detect_and_parse_markdown_tables` and rendered as a fallback. The `render_visual` tool is the preferred path.

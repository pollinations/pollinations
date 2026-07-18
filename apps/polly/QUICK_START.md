# Polly Media Handlers — Installation & Setup

Polly's `send_long_message()` and the `render_visual` tool produce four kinds of media:

1. **📊 Markdown Tables** — rendered as styled PNG images with markdown-aware cells (bold/italic/code)
2. **📈 Charts** — bar / horizontal_bar / line / area / scatter / pie / donut / heatmap / histogram via matplotlib + seaborn
3. **∑ LaTeX Expressions** — rendered as PNGs (inline `$...$` and display `$$...$$`)
4. **💻 Code Blocks** — smart splitting without breaking lines

## Files

```
apps/polly/
├── src/services/
│   ├── media_handlers.py          Tables, LaTeX, code blocks (PIL)
│   ├── chart_renderer.py          matplotlib/seaborn chart engine
│   └── charts.py                  render_visual tool dispatch
├── docs/
│   └── MEDIA_HANDLERS.md          Full documentation
├── assets/fonts/                  Vendored TTFs (Noto Sans VF, IBM Plex Mono)
└── requirements.txt               All deps incl. matplotlib, seaborn, pillow
```

## Quick Start

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

3. Run:

   ```bash
   python main.py
   ```

Fonts are vendored in `assets/fonts/`, so no separate font-download step is needed.

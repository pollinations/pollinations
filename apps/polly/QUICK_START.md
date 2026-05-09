# 🎉 Polly Media Handlers — Installation & Setup

## What's New?

Polly's `send_long_message()` ships three media handlers:

1. **📊 Markdown Tables** → Rendered as styled PNG images
2. **∑ LaTeX Expressions** → Rendered as PNG images
3. **💻 Code Blocks** → Smart splitting without breaking lines

## Files

```
apps/polly/
├── src/services/
│   └── media_handlers.py          Main handler module
├── src/bot.py                     Integrated via send_long_message()
├── docs/
│   └── MEDIA_HANDLERS.md          Full documentation
├── setup-media-handlers.sh        Optional: downloads Noto Sans fonts
└── requirements.txt               Includes pillow, pilmoji, cairosvg
```

## Quick Start

1. Create and activate a virtualenv in `apps/polly`:

   ```bash
   cd apps/polly
   python -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies (media handlers included):

   ```bash
   pip install -r requirements.txt
   ```

3. Optional — download Noto Sans fonts for nicer table rendering:

   ```bash
   bash setup-media-handlers.sh
   ```

4. Start the bot:

   ```bash
   python main.py
   ```

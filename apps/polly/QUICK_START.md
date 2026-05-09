# 🎉 Polly Media Handlers - Installation & Setup

## What's New?

Polly now has three powerful media handlers integrated into `send_long_message()`:

1. **📊 Markdown Tables** → Automatically renders as styled PNG images
2. **∑ LaTeX Expressions** → Automatically renders as PNG images
3. **💻 Code Blocks** → Smart splitting without breaking lines

## Files Created

```
apps/polly/
├── src/services/
│   └── media_handlers.py          ✨ NEW - Main handler module
├── src/bot.py                      📝 UPDATED - Enhanced send_long_message()
├── docs/
│   └── MEDIA_HANDLERS.md          ✨ NEW - Full documentation
├── requirements-media.txt         ✨ NEW - Optional dependencies
├── setup-media-handlers.sh        ✨ NEW - Automatic setup with font download
├── README.md                       📝 UPDATED - Added setup step 4
├── QUICK_START.md                 ✨ NEW - This file
```

> **Note:** The `assets/fonts/` directory and fonts are created automatically by `setup-media-handlers.sh`

## Quick Start

### 1. No Action Required (Basic Installation)
The handlers are **already integrated** into `send_long_message()` in `bot.py`.
Your existing code works automatically with:
- ✓ Code blocks (always works)
- ⚠️ Tables as text (no PIL)
- ⚠️ LaTeX as text (no cairosvg)
# Quick Start — Production

Minimal production instructions for the Polly media handlers. For development notes and examples, use the repository history.

1) Create and activate a virtualenv in `apps/polly`:

```bash
cd apps/polly
python -m venv venv
source venv/bin/activate
```

2) Run the setup script to download fonts and install optional deps:

```bash
bash setup-media-handlers.sh
```

3) Start the bot (or run under your process manager/container):

```bash
source venv/bin/activate
python main.py
```

**Polly Media Handlers — Production deployment (minimal)**

This file contains the minimal steps required to deploy the Polly media handlers in production (Markdown table rendering, LaTeX conversion, and code block handling).

Prerequisites
- Python 3.10+ (tested with 3.14)
- System packages required by `cairosvg` if you plan to convert SVG → PNG locally

Quick production steps

1) Create and activate a virtual environment in `apps/polly`:

```bash
cd apps/polly
python -m venv venv
source venv/bin/activate
```

2) Install dependencies (media handlers are included in `requirements.txt`):

```bash
pip install -r requirements.txt
```

3) Optional — run the helper to download Noto Sans fonts for nicer table rendering:

```bash
bash setup-media-handlers.sh
```

This places Noto Sans TTF variants in `assets/fonts/`. If the directory is missing, the handlers fall back to default system fonts.

4) Start the bot/service in production mode:

```bash
source venv/bin/activate
python main.py
```

For robust production deployments, run the process under a supervisor (systemd, supervisord) or inside a container, and provide required environment variables and secrets securely.

Notes
- If `assets/fonts/` is missing, the handlers will fall back to default system fonts.
- Development docs and examples were removed from the working tree to keep the repository small; retrieve them from the Git history if needed.

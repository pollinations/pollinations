# Model Monitor

Real-time health monitoring for Pollinations model endpoints.

## Features

- Monitors the public model catalog and cached health API from `gen.pollinations.ai`
- Uses polling intervals appropriate to the selected aggregation window
- Displays request volume, reliability, latency, and catalog anomalies
- Separates official and community model health
- Responsive design (mobile, tablet, desktop)

## Evals tab

`#evals` shows the weekly model evals: the latest ranking, past runs, and each
community model next to the official model it is named after (a gap bigger than
both margins of error combined is highlighted). Results come from the `evals`
data branch, written by `.github/workflows/evals-run-weekly.yml`, which runs
`operations/model-evals` (see `node operations/model-evals/run.js --help`).
Locally, set `VITE_EVALS_DATA_URL` to serve results from another location.

## Endpoints Monitored

- **Model catalog**: `https://gen.pollinations.ai/models`
- **Model health**: `https://gen.pollinations.ai/models/status`

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Production is deployed through the operations GitHub Actions workflow to the
existing `apps-model-monitor` Cloudflare Pages project. The project name and
its `model-monitor.myceli.ai` and `model-monitor.pollinations.ai` domains are
kept stable even though the repository folder now lives under `operations/`.

## Tech Stack

- React 19
- Vite
- Tailwind CSS 4

# Model Monitor

Real-time health monitoring for Pollinations model endpoints.

## Features

- Monitors the public model catalog and cached health API from `gen.pollinations.ai`
- Uses polling intervals appropriate to the selected aggregation window
- Displays request volume, reliability, latency, and catalog anomalies
- Separates official and community model health
- Responsive design (mobile, tablet, desktop)

## Endpoints Monitored

- **Model catalog**: `https://gen.pollinations.ai/models`
- **Model health**: `https://gen.pollinations.ai/v1/models/status`

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

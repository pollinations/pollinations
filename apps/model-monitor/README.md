# Model Monitor

Real-time health monitoring for pollinations.ai model endpoints.

## Features

- Monitors `enter.pollinations.ai` image and text model endpoints
- 5-second polling interval (configurable)
- Displays latency, model count, and endpoint health status
- Shows model details: name, aliases, description, input/output modalities
- Responsive design (mobile, tablet, desktop)

## Endpoints Monitored

- **Image Models**: `https://gen.pollinations.ai/image/models`
- **Text Models**: `https://gen.pollinations.ai/text/models`

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Tech Stack

- React 18
- Vite
- Tailwind CSS 4

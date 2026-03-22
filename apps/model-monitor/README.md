# Model Monitor

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/pollinations/pollinations/tree/main/apps/model-monitor)
[![Open in Bolt](https://img.shields.io/badge/Open%20in-Bolt.new-black?style=flat-square&logo=stackblitz)](https://bolt.new/?prompt=Clone%20the%20Model%20Monitor%20from%20https%3A%2F%2Fgithub.com%2Fpollinations%2Fpollinations%2Ftree%2Fmain%2Fapps%2Fmodel-monitor%20and%20set%20it%20up.%20React%20%2B%20Vite%20%2B%20Tailwind%20dashboard%20monitoring%20Pollinations%20API%20model%20endpoints.)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-blue?style=flat-square&logo=codesandbox)](https://codesandbox.io/s/github/pollinations/pollinations/tree/main/apps/model-monitor)

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

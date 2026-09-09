# 🏛️ Map to 3D Isometric Buildings

Transform any map screenshot or location into beautiful 3D isometric building visualizations.

## What It Does

Upload a map view from Google Maps, OpenStreetMap, or any mapping service, and this app generates an artistic isometric 3D representation with buildings, streets, and landmarks using AI.

## Quick Start

cd apps/map-to-isometric
npm install
npm run dev


Open http://localhost:5173

## Build for Production


The `dist/` folder will contain your production-ready app.

## Features

- 📁 Upload map images or paste from clipboard
- ✨ AI-powered isometric 3D transformation
- 🎨 Customizable generation prompts
- ⬇️ Download generated images
- 📱 Responsive design for mobile and desktop
- 🚀 Frontend-only (no backend required)

## How It Works

Uses the Pollinations Image API with reference image transformation to convert flat map views into isometric 3D architectural visualizations. The app sends your map image along with a descriptive prompt to generate unique isometric artwork.

## Use Cases

- Urban planning visualization
- Game level design inspiration
- Architecture portfolio pieces
- City exploration art
- Real estate visualization

## Technologies Used

- React
- Vite
- Pollinations AI Image API
- Pure CSS styling

## Inspiration

Based on Case [#33](https://github.com/pollinations/pollinations/issues/33) from [Awesome-Nano-Banana-images](https://github.com/PicoTrex/Awesome-Nano-Banana-images)

Made for Hacktoberfest 2025 🎃

# Video Service Integration Guide

## What's Included

This PR adds `videoService.js` - a complete implementation for video generation via MCP.

**Features:**
- Generate videos using Veo or Seedance models
- Support for custom dimensions, duration, and seeds
- List available video models

## Integration Required

To enable the video service, add to `src/index.js`:

```javascript
import { videoTools } from "./services/videoService.js";

// In toolDefinitions array:
const toolDefinitions = [
    ...imageTools,
    ...textTools,
    ...audioTools,
    ...videoTools,  // Add this line
    ...authTools,
];
```

## Testing

```bash
# Test video URL generation
node -e "import('./src/services/videoService.js').then(m => m.videoTools[0][3]({prompt: 'A cat dancing'}).then(console.log))"
```

## API

**generateVideoUrl(params)**
- `prompt` (string, required): Text description
- `model` (string, optional): "veo" or "seedance" (default: "veo")
- `width` (number, optional): Default 1280
- `height` (number, optional): Default 720
- `duration` (number, optional): Default 5s
- `seed` (number, optional): For reproducible results

**Example:**
```javascript
await generateVideoUrl({
    prompt: "A robot painting a masterpiece",
    model: "veo",
    duration: 8
});
```

# 🤖 Model Viewer

A beautiful, interactive viewer for exploring all available Pollinations AI models for text and image generation.

## What it does

This app displays all text and image generation models available through the Pollinations API in a clean, modern interface with:

- **Two categories**: Text models and Image models
- **Model information**: Name, description, tier (free/paid), and capabilities
- **Feature badges**: Shows input/output modalities, tool support, reasoning capabilities, etc.
- **Psychedelic design**: Eye-catching Gen-Z style matching the Pollinations brand
- **Live data**: Fetches real-time model information from Pollinations API
- **Fallback support**: Shows cached models if API is unavailable

## Features

### Text Models
- View all available LLM models
- See capabilities: text/image/audio input, tool support, reasoning, etc.
- Identify community and uncensored models
- Check tier levels (anonymous/free vs paid tiers)

### Image Models  
- Browse image generation models
- View specifications: max resolution, enhancement support
- Compare model capabilities
- See tier requirements

## How to use

1. Open `index.html` in any modern web browser
2. Click tabs to switch between Text and Image models
3. Browse through the cards to see model details
4. Use the information to choose the right model for your project!

## Technology

- **Pure HTML/CSS/JS**: No build step, no dependencies
- **Pollinations APIs**:
  - Text models: `https://text.pollinations.ai/models`
  - Image models: `https://image.pollinations.ai/about`
- **Space Grotesk font**: For that modern, tech-forward look
- **CSS animations**: Psychedelic border and gradient effects

## Design

The design matches Pollinations' brand with:
- Psychedelic color-shifting borders (#ff61d8, #05ffa1, #ffcc00)
- Animated gradients and highlights
- Card-based layout with hover effects
- Responsive grid system
- Gen-Z aesthetic matching auth.pollinations.ai

## Why it's useful

Before building an app with Pollinations, you need to know:
- What models are available?
- What can each model do?
- Which models are free?
- What are the input/output formats?

This viewer answers all those questions at a glance!

## Credits

Based on the Models page from pollinations.ai, converted to a standalone Hacktoberfest app.

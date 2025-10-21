# 🤖 Model Viewer

A beautiful, interactive viewer for exploring all available Pollinations AI models for text and image generation, with AI-powered descriptions.

## What it does

This app displays all text and image generation models available through the Pollinations API in a clean, modern interface with:

- **Two categories**: Text models and Image models
- **Model information**: Name, description, tier (free/paid), and capabilities
- **Feature badges**: Shows input/output modalities, tool support, reasoning capabilities, etc.
- **AI-powered descriptions**: Click the "✨ Get AI Description" button on any model to generate a concise, AI-generated explanation using Gemini Search
- **Psychedelic design**: Eye-catching Gen-Z style matching the Pollinations brand
- **Live data**: Fetches real-time model information from Pollinations API
- **Fallback support**: Shows cached models if API is unavailable

## Features

### Text Models
- View all available LLM models
- See capabilities: text/image/audio input, tool support, reasoning, etc.
- Identify community and uncensored models
- Check tier levels (anonymous/free vs paid tiers)
- Get AI-generated insights about each model

### Image Models  
- Browse image generation models
- View specifications: max resolution, enhancement support
- Compare model capabilities
- See tier requirements
- Get AI-powered descriptions of what makes each model unique

### AI Description Feature 🆕
Each model card includes a "✨ Get AI Description" button that uses the **gemini-search** model to generate:
- Brief, simple explanations of what the model does
- What makes the model unique
- Best use cases for the model
- Quick insights to help you choose the right model

## How to use

1. Open `index.html` in any modern web browser
2. Click tabs to switch between Text and Image models
3. Click "✨ Get AI Description" on any model card to get an AI-generated explanation
4. Browse through the cards to see model details
5. Use the information to choose the right model for your project!

## Technology

- **Pure HTML/CSS/JS**: No build step, no dependencies
- **Pollinations APIs**:
  - Text models: `https://text.pollinations.ai/models`
  - Image models: `https://image.pollinations.ai/about`
  - AI descriptions: `https://text.pollinations.ai/gemini-search`
- **Space Grotesk font**: For that modern, tech-forward look
- **CSS animations**: Psychedelic border effects, floating header, shimmer effects
- **Gemini Search integration**: For AI-powered model descriptions

## Design Improvements

The design has been enhanced with:
- ✨ **Floating header animation** - The page title gently floats
- 🌟 **Shimmer effect on hover** - Model cards have a subtle light sweep on hover
- 🎨 **Gradient AI buttons** - Beautiful purple gradient for AI description buttons
- 💫 **Pulse animation** - Loading states have smooth pulsing effects
- 🎯 **Better visual hierarchy** - Improved spacing and contrast

## Why it's useful

Before building an app with Pollinations, you need to know:
- What models are available?
- What can each model do?
- Which models are free?
- What are the input/output formats?
- What makes each model special?

This viewer answers all those questions at a glance, and the AI description feature provides additional context to help you make informed choices!

## Credits

Based on the Models page from pollinations.ai, converted to a standalone Hacktoberfest app with enhanced features including AI-powered descriptions using Pollinations' gemini-search model.

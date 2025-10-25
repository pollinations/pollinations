# 🤖 Model Viewer - Complete AI Models Explorer

A comprehensive, feature-rich viewer for exploring all available Pollinations AI models for text and image generation, with pre-generated AI insights, real-time uptime monitoring, and advanced features.

## Project Structure

The project is now organized into separate files for better maintainability:

- **index.html** - Main HTML structure
- **styles.css** - All styling and animations
- **script.js** - JavaScript logic and uptime checker
- **README.md** - Documentation

## What it does

This advanced app displays all text and image generation models available through the Pollinations API in a modern, professional interface with extensive features:

- **Dual categories**: Text models (13) and Image models (4) with live statistics
- **Real-time uptime monitoring**: Track model availability with visual uptime bars
- **Uptime history**: View the last 24 hours of uptime status for each model
- **Uptime percentage**: See availability percentage for each model
- **Pre-generated AI insights**: Every model includes AI-powered descriptions explaining what makes it unique and best use cases
- **Advanced search & filters**: Search by name, filter by tier (free/paid), capabilities (tools, reasoning, multimodal)
- **Multiple views**: Grid, List, and Compact view modes for different preferences
- **Dark mode**: Full dark theme support with persistent preference saving
- **Code examples**: Click any model to get instant JavaScript, Python, and cURL code examples
- **Favorites system**: Mark your favorite models for quick access (persisted in localStorage)
- **Responsive design**: Works perfectly on desktop, tablet, and mobile devices
- **Live data**: Fetches real-time model information from Pollinations API
- **Fallback support**: Shows cached models if API is unavailable

## Features

### Core Features
- **17 AI models** - 13 text generation models + 4 image generation models
- **Real-time uptime monitoring** - Visual bars showing model availability status
- **Uptime history tracking** - Last 24 hours of uptime data displayed as bar charts
- **Status indicators** - Live status (🟢 Online, 🔴 Offline, ⏳ Checking)
- **Uptime percentage** - See availability percentage for each model over time
- **Pre-generated AI insights** - Every model has a curated AI-powered description explaining its unique features and ideal use cases
- **Live statistics** - Real-time dashboard showing total models, text/image breakdown, and free model count
- **Smart search** - Instantly search models by name or description
- **Advanced filters**:
  - All Models
  - Free Only (anonymous + seed tier)
  - With Tools (models supporting function calling)
  - Reasoning (models with step-by-step logic capabilities)
  - Multimodal (models accepting multiple input types)

### View Options
- **Grid View** 📱 - Beautiful card layout with full details (default)
- **List View** 📄 - Compact single-column layout
- **Compact View** ⚡ - Dense grid for maximum information density

### Interactive Features
- **Uptime Monitoring** 📊 - Real-time availability tracking with visual history bars
  - Color-coded segments (green = up, red = down, gray = unknown)
  - Hover to see exact timestamp and status
  - Automatic checks every 5 minutes
  - Data persisted in localStorage
- **Code Examples** 💻 - Click any model to get instant code snippets in:
  - JavaScript (fetch API)
  - Python (requests library)
  - cURL (command line)
- **Copy to Clipboard** 📋 - Quickly copy model information
- **Favorites** ❤️ - Mark favorite models (saved in browser)
- **Dark Mode** 🌙 - Full dark theme with automatic persistence

### Model Information Displayed
- Model name and description
- Tier level (FREE, SEED, FLOWER, NECTAR) with visual badges
- **Real-time uptime status and history bar**
- **Uptime percentage over last 24 hours**
- AI-generated insights about best use cases
- Input modalities (text, image, audio)
- Output modalities (text, audio)
- Special capabilities (tools, reasoning, enhancement)
- Technical specifications (max image size, etc.)
- Special tags (Reasoning ⚡, Uncensored 🔓, Community 👥)

## How to use

1. **Open** `index.html` in any modern web browser
2. **Browse** models by clicking tabs to switch between Text and Image models
3. **Search** using the search bar in the header
4. **Filter** by clicking filter buttons (Free Only, With Tools, etc.)
5. **Sort** using the dropdown (by Name, Tier, or Newest)
6. **View Uptime** - Each model card shows real-time uptime status and 24-hour history
7. **Get Code** by clicking 💻 Code on any model to see implementation examples
8. **Toggle Theme** with the 🌙 Dark Mode button in the header
9. **Favorite** models by clicking the heart icon
10. **Copy Info** with the 📋 Copy button to quickly share model details

## Technology Stack

- **Pure HTML/CSS/JS**: No build step, no dependencies, no framework overhead
  - **index.html**: Clean semantic HTML structure
  - **styles.css**: Comprehensive styling with animations and responsive design
  - **script.js**: Feature-rich JavaScript with uptime monitoring
- **Pollinations APIs**:
  - Text models: `https://text.pollinations.ai/models`
  - Image models: `https://image.pollinations.ai/about`
- **Fonts**:
  - Space Grotesk: Modern, tech-forward display font
  - Fira Code: Monospace font for code examples
- **Advanced CSS**: 
  - CSS Grid & Flexbox for responsive layouts
  - CSS Custom Properties for theming
  - Complex animations (float, shimmer, pulse, glow, bounce)
  - Smooth transitions and hover effects
- **localStorage**: Persists user preferences (theme, favorites, uptime history)
- **Modern JavaScript**:
  - Async/await for API calls
  - ES6+ features (arrow functions, destructuring, template literals)
  - State management pattern
  - Event delegation
  - Copy to clipboard API
  - Fetch API with timeout handling

## Advanced Features Details

### Uptime Monitoring System
The app includes a sophisticated uptime monitoring system that:
- **Checks model availability** every 5 minutes automatically
- **Stores 48 data points** (4 hours of history with 5-minute intervals)
- **Displays status** with color-coded visual bars:
  - 🟢 Green: Model is available (up)
  - 🔴 Red: Model is unavailable (down)
  - ⚪ Gray: Status unknown (not yet checked)
- **Shows percentage** - Calculates uptime percentage over the monitored period
- **Hover details** - See exact timestamp and status for each check
- **Persists data** - Uses localStorage to maintain history across sessions
- **Smart checking** - Uses timeouts to prevent hanging requests
- **API-aware** - Different checking strategies for text vs image models

### Pre-generated AI Summaries
Unlike typical model lists, every model includes a curated AI-generated summary that explains:
- What makes the model unique
- Ideal use cases and applications
- Best scenarios for using this model over others

These summaries are pre-loaded (not generated on-demand) for instant display and better UX.

### Model Comparison Tool
*Note: This feature was removed in favor of the uptime monitoring system to keep the interface focused and performant.*

### Code Examples
Every model provides ready-to-use code examples in multiple languages:
- **JavaScript**: Modern fetch API with proper headers
- **Python**: Using requests library with JSON handling  
- **cURL**: Command-line examples for quick testing
All code includes one-click copy functionality.

### Uptime Statistics
The uptime system provides at-a-glance health metrics:
- **Current status** - Live indicator (Online/Offline/Checking)
- **24-hour history** - Visual bar chart with 24 segments
- **Uptime percentage** - Calculated from available data points
- **Persistent tracking** - History saved in browser localStorage
- **Automatic refresh** - Updates every 5 minutes automatically

### Filter System
Sophisticated filtering system allows combinations:
- **Free Only**: Shows only anonymous and seed tier models
- **With Tools**: Models supporting function/tool calling
- **Reasoning**: Models with advanced logical reasoning
- **Multimodal**: Models accepting multiple input types

### Sort Options
- **By Name**: Alphabetical ordering
- **By Tier**: Groups by access level (free → paid)
- **Newest First**: Shows most recently added models first

## Design Highlights

The design features a modern, professional aesthetic with:
- **Floating header animation** - Subtle breathing effect on the main title
- **Shimmer effects** - Light sweep animation on card hover
- **Color-coded tiers** - Visual indicators for model access levels
- **Smooth transitions** - All interactions feel polished
- **Responsive grid** - Adapts seamlessly to all screen sizes
- **Dark mode** - Complete dark theme with proper contrast
- **Psychedelic accents** - Color-shifting borders matching Pollinations brand
- **Glass morphism** - Modern semi-transparent effects
- **Custom scrollbars** - Branded scrollbar styling

## File Size & Performance

- **Modular structure**: Separated into HTML (4.9KB), CSS (21KB), and JS (29KB)
- **Total size**: ~55KB uncompressed for all files
- **Zero dependencies**: No external JavaScript libraries
- **Fast loading**: Optimized code with minimal DOM manipulation
- **Efficient**: Smart uptime checking with timeouts and caching
- **Caching**: Uses fallback data for offline functionality

## Browser Compatibility

Works on all modern browsers:
- ✅ Chrome/Edge (90+)
- ✅ Firefox (88+)
- ✅ Safari (14+)
- ✅ Opera (76+)

Requires JavaScript enabled.

## Why it's useful

Before building an app with Pollinations, developers need answers to:
- What models are available? ✅ **Full catalog with live counts**
- Are the models currently online? ✅ **Real-time uptime monitoring**
- What's the model reliability? ✅ **24-hour uptime history**
- What can each model do? ✅ **Detailed capabilities breakdown**
- Which models are free? ✅ **Free-only filter**
- What are the input/output formats? ✅ **Clear modality indicators**
- What makes each model unique? ✅ **AI-generated insights**
- How do I use this model? ✅ **Ready-to-use code examples**

This viewer provides comprehensive answers with an intuitive, professional interface that makes model selection easy and informed.

## Credits

Enhanced version of the Models page from pollinations.ai, refactored into a modular Hacktoberfest app with advanced functionality including:
- **Separated file structure** (HTML/CSS/JS)
- **Real-time uptime monitoring** with visual history
- **Uptime percentage tracking**
- Pre-generated AI model summaries
- Advanced filtering and search
- Code example generator
- Dark mode support
- Favorites system
- Multiple view modes
- And much more!

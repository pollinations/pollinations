# 🎬 PolliVision - AI Video Generator

<div align="center">

**Create stunning AI-generated videos using natural language prompts.**

*100% powered by Pollinations.ai APIs*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-fbbf24?style=for-the-badge)](https://fabioarieira.com/pollivision)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github)](https://github.com/FabioArieiraBaia/PolliVision)

</div>

---

## ✨ What is PolliVision?

PolliVision is a modern, chat-based AI video generator that transforms text descriptions into stunning videos. It features a beautiful interface inspired by Meta AI, with real-time cost estimation and multiple video models.

## 🎯 Features

| Feature | Description |
|---------|-------------|
| 🎬 **AI Video Generation** | Create videos with Seedance, Seedance Pro, or Veo models |
| 💬 **Chat Interface** | Beautiful, intuitive chat UI inspired by Meta AI |
| ✨ **Smart Prompt Enhancement** | AI automatically improves your prompts |
| 💰 **Pollen Credit System** | Real pricing based on official Pollinations rates |
| 🔐 **Secure API Keys** | Keys stored locally, never on servers |
| 📱 **Fully Responsive** | Works on desktop, tablet, and mobile |

## 🌸 How It Uses Pollinations

PolliVision is **100% powered by Pollinations APIs**:

### 1. Video Generation API
```javascript
const videoUrl = `https://video.pollinations.ai/prompt/${encodedPrompt}`;
```
Generates videos using Seedance, Seedance Pro, or Veo models.

### 2. Image Generation API
```javascript
const thumbnailUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux`;
```
Creates thumbnails for each video using Flux.

### 3. Text Generation API
```javascript
const enhanced = await fetch(`https://text.pollinations.ai/${prompt}?system=${systemPrompt}`);
```
Enhances user prompts for better video quality.

## 💰 Real Pollinations Pricing

| Model | Cost | Quality |
|-------|------|---------|
| 🎬 Seedance | 1 pollen ≈ 15s | High |
| ✨ Seedance Pro | 1 pollen ≈ 25s | Ultra |
| 🚀 Veo | 0.15 pollen/s | Ultra |

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 🛠️ Tech Stack

- **React 18** + **TypeScript**
- **Vite** for fast builds
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **Zustand** for state management

## 📁 Structure

```
pollivision/
├── src/
│   ├── components/
│   │   ├── ChatInterface.tsx    # Main chat UI
│   │   ├── ModelSelector.tsx    # Video model picker
│   │   ├── Header.tsx           # App header
│   │   ├── Sidebar.tsx          # Navigation
│   │   ├── ApiKeyModal.tsx      # API key config
│   │   └── PricingModal.tsx     # Credit purchase
│   ├── services/
│   │   └── pollinationsApi.ts   # API integration
│   ├── constants/
│   │   └── videoModels.ts       # Model definitions
│   ├── store/
│   │   └── useStore.ts          # State management
│   └── types/
│       └── index.ts             # TypeScript types
├── package.json
└── vite.config.ts
```

## 📸 Screenshots

| Chat Interface | Model Selection |
|:---:|:---:|
| Modern chat-based UI | Choose video model & duration |

## 👨‍💻 Developer

**Fábio Arieira** - Full Stack Developer

- 🌐 Website: [fabioarieira.com](https://fabioarieira.com)
- 💼 GitHub: [@FabioArieiraBaia](https://github.com/FabioArieiraBaia)

## 📄 License

MIT License - Feel free to use and modify!

---

<div align="center">

**Made with ❤️ and powered by 🌸 Pollinations.ai**

</div>

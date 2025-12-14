## Project Name
**PolliVision: AI Video Generator with Chat Interface**

## Project Description

**PolliVision** is a modern, chat-based AI video generator powered entirely by **Pollinations.ai APIs**. It provides a beautiful, intuitive interface inspired by Meta AI, where users can describe any scene and get stunning AI-generated videos.

### Key Features:

🎬 **AI Video Generation** - Transform text descriptions into stunning videos using Pollinations Video API
💬 **Chat Interface** - Beautiful, modern chat UI inspired by leading AI assistants
✨ **Smart Prompt Enhancement** - AI automatically enhances prompts for cinematic results using Pollinations Text API
🖼️ **Auto Thumbnails** - Generates video thumbnails using Pollinations Image API (Flux model)
🔐 **Secure API Keys** - User API keys stored locally, never on servers
💰 **Pollen Credit System** - Intuitive credit system to encourage Pollinations support
🌙 **Premium Dark Theme** - Eye-friendly design with glass-morphism effects
📱 **Fully Responsive** - Works beautifully on all devices

## Project URL
🌐 **Live Demo:** https://fabioarieira.com/pollivision

## GitHub Repository
🔗 **Repository:** https://github.com/FabioArieiraBaia/PolliVision

## Category
**Creative 🎨**

## How does your project use Pollinations?

PolliVision is **100% powered by Pollinations.ai** - it doesn't use any other AI provider:

### 1. 🎬 Video Generation API (Primary Feature)
```typescript
const videoUrl = `https://video.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&nologo=true`;
```
The core functionality uses Pollinations Video API to generate AI videos from text prompts.

### 2. 🖼️ Image Generation API (Thumbnails)
```typescript
const thumbnailUrl = `https://image.pollinations.ai/prompt/${prompt}?model=flux&width=640&height=360`;
```
Automatically creates beautiful thumbnails for each generated video using the Flux model.

### 3. 💬 Text Generation API (Prompt Enhancement)
```typescript
const enhanced = await fetch(`https://text.pollinations.ai/${prompt}?system=${systemPrompt}`);
```
Enhances user prompts for better video quality using AI text generation.

### Integration Architecture

```
User Input → Text API (Enhancement) → Video API (Generation) → Image API (Thumbnail)
                                                    ↓
                                            Beautiful Video Output
```

### Impact on Pollinations

- ⭐ **Showcases Video API** - Demonstrates the full potential of Pollinations video generation
- 💰 **Encourages Support** - Pollen credit system guides users to support Pollinations
- 📣 **Marketing Tool** - Beautiful UI that makes Pollinations accessible to non-technical users
- 🚀 **Production Ready** - Shows Pollinations can power production applications

## Additional Information

### Tech Stack:
- **Frontend:** React 18, TypeScript, Vite
- **Styling:** Tailwind CSS, Glass-morphism effects
- **Animations:** Framer Motion
- **State:** Zustand
- **APIs:** 100% Pollinations.ai (Video, Image, Text)

### Developer:
- **Name:** Fábio Arieira
- **Role:** Full Stack Developer
- **Website:** https://fabioarieira.com
- **GitHub:** https://github.com/FabioArieiraBaia

### Production Status:
- ✅ **In production and active**
- ✅ **Public URL working**
- ✅ **Open-source on GitHub**
- ✅ **Well documented**
- ✅ **MIT Licensed**

## Screenshots

| Chat Interface | Video Generation | Pricing System |
|:---:|:---:|:---:|
| Modern chat-based UI | Real-time video generation | Credit purchase modal |

## Why This Project Stands Out

1. **First-class Pollinations Integration** - Unlike many projects that use Pollinations as a fallback, PolliVision is built FROM THE GROUND UP for Pollinations APIs.

2. **Monetization Ready** - The pollen credit system is designed to encourage users to support Pollinations financially.

3. **Beautiful UX** - Professional-grade interface that makes AI video generation accessible to everyone.

4. **Open Source** - Fully open-source, allowing others to learn how to integrate Pollinations APIs.

5. **Production Quality** - Not a demo or prototype - a fully functional, production-ready application.

---

## Personal Note

I'm incredibly grateful to the **Pollinations.ai team** for creating such an amazing free and open platform. PolliVision wouldn't be possible without your generosity.

The Pollen credit system in PolliVision is specifically designed to **encourage users to support Pollinations** financially. Every credit purchase links directly to Pollinations, helping sustain this incredible platform.

**Thank you for democratizing AI creativity!** 🌸💛

---

**Developed with ❤️ by Fábio Arieira**  
🌐 https://fabioarieira.com  
📧 Contact: fabioarieira2@gmail.com




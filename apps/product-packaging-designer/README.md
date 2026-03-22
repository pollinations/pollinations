# 📦 AI Packaging Designer

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/pollinations/pollinations/tree/main/apps/product-packaging-designer)
[![Open in Bolt](https://img.shields.io/badge/Open%20in-Bolt.new-black?style=flat-square&logo=stackblitz)](https://bolt.new/?prompt=Clone%20AI%20Packaging%20Designer%20from%20https%3A%2F%2Fgithub.com%2Fpollinations%2Fpollinations%2Ftree%2Fmain%2Fapps%2Fproduct-packaging-designer%20and%20set%20it%20up.%20It%27s%20a%20React%20%2B%20Vite%20%2B%20TypeScript%20app%20for%20generating%20packaging%20mockups%20using%20the%20Pollinations%20API%20at%20gen.pollinations.ai.)
[![Open in Lovable](https://img.shields.io/badge/Open%20in-Lovable-ff69b4?style=flat-square)](https://lovable.dev/?autosubmit=true#prompt=Build%20an%20AI%20product%20packaging%20designer.%20Users%20upload%20a%20product%20photo%20and%20choose%20a%20style%2C%20then%20AI%20generates%20professional%20packaging%20mockups.%20Use%20the%20Pollinations%20API%20at%20gen.pollinations.ai%20for%20image%20generation.%20React%20%2B%20Tailwind.%20No%20API%20key%20needed.)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-blue?style=flat-square&logo=codesandbox)](https://codesandbox.io/s/github/pollinations/pollinations/tree/main/apps/product-packaging-designer)

Transform your product photos into professional packaging mockups using AI. Upload an image, customize the style, and get stunning packaging designs in seconds!

## What It Does

This React app uses Pollinations AI to generate realistic product packaging mockups from your product images. Perfect for entrepreneurs, designers, and marketers who need quick packaging visualizations.

**Key Features:**

- 🖼️ Image upload with drag & drop
- 📦 Multiple packaging types (Box, Bottle, Bag, Can)
- 🎨 5 design styles (Minimalist, Vintage, Luxury, Eco-friendly, Japanese)
- ✨ Custom style descriptions
- 🏷️ Brand name integration
- 🌙 Dark/Light theme toggle
- 💾 High-resolution download
- 📱 Fully responsive design

## Screenshots

![App Screenshot](https://res.cloudinary.com/dwzvfzqs7/image/upload/v1759940485/cr4gbhlvx5ybfscgszug.png)
_Main interface _

![Generated Packaging](https://res.cloudinary.com/dwzvfzqs7/image/upload/v1759939178/p6bjg0grgyzsh5bmh9sj.jpg)
_Generated luxury camera packaging example_

## How to Use

1. **Upload Product Image**: Click or drag & drop your product photo (PNG/JPG, up to 10MB)
2. **Choose Packaging Type**: Select from Box, Bottle, Bag, or Can
3. **Pick Design Style**: Choose from 5 predefined styles or describe your custom style
4. **Add Brand Details**: Enter your brand name or slogan (optional)
5. **Generate**: Click "Generate Packaging" and watch the AI create your mockup
6. **Download**: Save your high-resolution packaging design

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **Pollinations AI** - Image generation API
- **Cloudinary** - Image hosting (fallback)

## Installation & Setup

### Prerequisites

- Node.js 16+ and npm

### Local Development

1. **Clone the repository:**

```bash
git clone https://github.com/pollinations/pollinations.git
cd pollinations/apps/product-packaging-designer
```

2. **Install dependencies:**

```bash
npm install
```

3. **Start development server:**

```bash
npm run dev
```

4. **Open in browser:**

```
http://localhost:5173
```

### Build for Production

```bash
npm run build
npm run preview  # Preview production build
```

## API Integration

This app uses the **Pollinations Image API** for AI-powered packaging generation:

```
https://image.pollinations.ai/prompt/{prompt}?model=nanobanana&image={product_image}&quality=high
```

**Features used:**

- Image-to-image generation with product integration
- Custom prompting for different packaging styles
- High-quality output optimization
- No API key required (public endpoint)

## File Structure

```
product-packaging-designer/
├── README.md
├── package.json
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── src/
    ├── App.tsx          # Main application component
    ├── main.tsx         # React entry point
    ├── index.css        # Global styles
    └── vite-env.d.ts    # Vite type definitions
```

## Features in Detail

### 🎨 Design Styles

- **Minimalist**: Clean, simple, modern aesthetics
- **Vintage**: Retro, classic design elements
- **Luxury**: Premium, elegant gold accents
- **Eco-friendly**: Natural, sustainable appearance
- **Japanese**: Zen, refined simplicity
- **Custom**: Describe your own unique style

### 📦 Packaging Types

- **Box**: Product boxes and containers
- **Bottle**: Liquid products and beverages
- **Bag**: Flexible packaging and pouches
- **Can**: Cylindrical containers and tins

### 🔧 Advanced Features

- **File Validation**: Automatic image format and size checking
- **Error Handling**: Comprehensive error messages and fallbacks
- **Loading States**: Smooth animations during generation
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Theme Support**: Dark and light mode with localStorage persistence
- **Download Management**: Blob-based downloads with proper cleanup

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## Known Limitations

- Maximum file size: 10MB for display, 5MB for upload
- Supported formats: JPEG, PNG, WebP
- Generation time: 10-30 seconds depending on complexity
- Requires internet connection for AI generation

## License

This app is part of the Pollinations Hacktoberfest 2025 collection. See the main repository for license details.

## Credits

- **AI Generation**: [pollinations.ai](https://pollinations.ai)
- **Icons**: [Lucide React](https://lucide.dev)
- **Styling**: [Tailwind CSS](https://tailwindcss.com)
- **Build Tool**: [Vite](https://vitejs.dev)

---

**Made with 💜 by [pollinations.ai](https://pollinations.ai)**

_Part of Hacktoberfest 2025 - Building the future of AI-powered creativity!_

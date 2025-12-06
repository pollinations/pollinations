# Virtual Makeup Studio

An AI-powered virtual makeup try-on application that lets you experiment with different makeup styles instantly using your photos.

## Description

Virtual Makeup Studio uses the Pollinations AI image generation API to apply realistic makeup transformations to your selfies. Choose from preset styles or describe your custom look, and watch the AI work its magic in seconds.

## Features

- **Instant Transformations**: AI-powered makeup application in seconds
- **Multiple Preset Styles**: Natural, Dramatic, K-Beauty, and Vintage looks
- **Custom Prompts**: Describe your dream makeup style in your own words
- **Before/After Comparison**: Interactive slider to compare original and transformed images
- **Download Results**: Save your transformed photos locally
- **Responsive Design**: Beautiful, modern interface that works on all devices

## Tech Stack

- React
- Vite
- Tailwind CSS
- Pollinations AI API
- Lucide React Icons

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

## Usage

1. **Upload Your Photo**: Click the upload area or drag and drop a selfie
2. **Choose a Style**: Select from preset makeup styles or create a custom prompt
3. **Apply Makeup**: Click the "Apply Makeup Magic" button
4. **Compare**: Use the slider to compare before and after results
5. **Download**: Save your transformed image to your device

## Preset Makeup Styles

- **Natural**: Everyday makeup with nude lipstick, subtle eyeshadow, light mascara
- **Dramatic**: Bold evening makeup with red lipstick, smokey eyes, winged eyeliner
- **K-Beauty**: Korean beauty style with gradient lips, aegyo sal, dewy skin
- **Vintage**: 1950s retro look with bold red lips, dramatic winged liner

## Custom Prompts

Describe any makeup look you can imagine! Examples:
- "Apply golden eyeshadow with nude lips and bronzed cheeks"
- "Purple smokey eye with glossy pink lips and highlighter"
- "Natural glam with brown eyeshadow and coral lips"

## API Information

This application uses the Pollinations AI API with the following configuration:
- Model: nanobanana
- Image dimensions: 1024x1024
- Enhanced prompts enabled

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Browser Support

Works on all modern browsers that support:
- ES6+ JavaScript
- FileReader API
- Blob/Object URLs
- CSS Grid and Flexbox

## License

MIT

## Credits

Powered by Pollinations AI

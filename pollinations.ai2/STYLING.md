# Styling System

## Stack

✅ **Tailwind CSS** - Utility-first CSS framework  
✅ **shadcn/ui** - Accessible, customizable components  
✅ **class-variance-authority** - Variant-based styling

---

## Tailwind Config

Your custom colors are configured in `tailwind.config.js`:

```js
colors: {
  lime: '#ecf874',          // Primary accent
  offwhite: '#c7d4d6',      // Text
  offblack: '#110518',      // Background
  'offblack-2': '#181A2C',  // Secondary background
  gray1: '#B3B3B3',         // Secondary text
  gray2: '#8A8A8A',         // Borders
}

fontFamily: {
  title: ['Maven Pro'],     // Titles/headings
  headline: ['Mako'],       // Section headlines
  body: ['Duru Sans'],      // Body text
}

boxShadow: {
  'brutal': '8px 8px 0px 0px rgba(0,0,0,1)',
  'brutal-lime': '8px 8px 0px 0px rgba(236,248,116,1)',
  'brutal-lg': '16px 16px 0px 0px rgba(0,0,0,1)',
}
```

---

## Usage Examples

### Tailwind Classes

```jsx
// Typography
<h1 className="font-title text-7xl font-black text-lime">

// Layout
<div className="flex flex-col gap-4 p-8">

// Colors
<div className="bg-offblack text-offwhite border-lime">

// Responsive
<div className="text-base md:text-xl lg:text-2xl">
```

### shadcn/ui Button Component

Located in: `src/components/ui/button.jsx`

```jsx
import { Button } from '../components/ui/button'

// Variants
<Button variant="default">Default</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="brutal">Brutalist Style</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
```

---

## Adding More shadcn/ui Components

To add more components (tabs, cards, dialogs, etc.):

1. Create file in `src/components/ui/`
2. Copy component code from https://ui.shadcn.com
3. Adjust colors/styles to match our theme

Example components to add next:

-   **Tabs** - For tab navigation (better than current NavLink)
-   **Card** - For feature cards, project cards
-   **Dialog** - For modals
-   **Input** - For forms

---

## Brutalist Styling Ready

The config includes **brutalist shadows** for Gen Z aesthetic:

```jsx
<div className="shadow-brutal">
  // 8px black shadow
</div>

<Button variant="brutal">
  // Brutalist button with thick border
</Button>
```

---

## Current Status

✅ HomePage - Fully migrated to Tailwind  
✅ Button component - Ready to use  
⏳ Layout - Still uses inline styles  
⏳ Other pages - Still use inline styles

**Next**: Convert Layout component to use Tailwind classes.

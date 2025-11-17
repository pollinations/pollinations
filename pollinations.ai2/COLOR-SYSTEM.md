# Color System Documentation

## Quick Start

### Changing the Theme

Edit `tailwind.config.js` and change these hex values:

```javascript
colors: {
    lime: "#ecf874",      // ← Change main accent color
    rose: "#ff69b4",      // ← Change border/highlight color
    offwhite: "#c7d4d6",  // ← Change background color
    offblack: "#110518",  // ← Change text color
}
```

Then restart dev server - **all components update automatically!**

## Usage in Components

### Original Names (Currently Used)

```jsx
className = "bg-lime/90 text-offblack border-rose";
```

### Semantic Names (Recommended for New Code)

```jsx
className = "bg-primary/90 text-foreground border-accent";
```

### Opacity Modifiers

Add `/` + number for transparency:

```jsx
bg - lime / 90; // 90% opacity
bg - rose / 80; // 80% opacity
bg - offblack / 5; // 5% opacity (very subtle)
```

## Available Colors

| Color Name | Hex Code | Usage                     | Semantic Alias |
| ---------- | -------- | ------------------------- | -------------- |
| `lime`     | #ecf874  | Active states, buttons    | `primary`      |
| `rose`     | #ff69b4  | Borders, shadows, accents | `accent`       |
| `offwhite` | #c7d4d6  | Page background           | `background`   |
| `offblack` | #110518  | Text, dark elements       | `foreground`   |
| `gray1`    | #B3B3B3  | Secondary elements        | -              |
| `gray2`    | #8A8A8A  | Tertiary elements         | -              |

## Examples

### Button

```jsx
<button className="bg-primary text-foreground border-4 border-accent">
    Click Me
</button>
```

### Card

```jsx
<div className="bg-background/90 border-r-4 border-b-4 border-accent">
    Content
</div>
```

### Text with Transparency

```jsx
<p className="text-foreground/70">Subtle text</p>
```

## Architecture

-   **Single Source of Truth**: `tailwind.config.js`
-   **No CSS Variables**: Everything through Tailwind for better DX
-   **Tree-Shakeable**: Unused colors don't bloat bundle
-   **Type-Safe**: IDE autocomplete + error checking
-   **Hot Reload**: Changes update instantly in dev

## Why This Approach?

✅ **Better DX**: Autocomplete, type checking, instant preview  
✅ **Smaller Bundle**: Only used colors included  
✅ **Easy Theming**: Change 4 colors, entire site updates  
✅ **Opacity Support**: Built-in `/90`, `/80` modifiers  
✅ **No Conflicts**: No CSS specificity battles

## Migration Guide

If you see old CSS variables in code, replace:

```css
/* OLD - Don't use */
color: var(--color-lime);

/* NEW - Use this */
className="text-lime"
```

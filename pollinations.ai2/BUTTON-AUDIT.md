# Complete Button Parameter Audit

## Goal: Document EXACT visual parameters for every button to ensure zero UI changes

---

## EXISTING shadcn/ui Button

**Location:** `/src/components/ui/button.jsx`

**Current variants:**

```jsx
buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap font-headline uppercase tracking-wider font-black transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default:
                    "bg-lime/90 text-offblack border-r-4 border-b-4 border-rose shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] hover:shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] backdrop-blur-sm",
                outline:
                    "bg-offwhite/80 text-offblack border-r-4 border-b-4 border-rose hover:bg-lime/90 hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] backdrop-blur-sm",
                ghost: "hover:bg-lime/10 text-offwhite",
                brutal: "bg-lime/90 text-offblack border-r-4 border-b-4 border-rose shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] hover:shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] backdrop-blur-sm",
            },
            size: {
                default: "px-4 py-3 text-xs",
                sm: "px-3 py-2 text-xs",
                lg: "px-8 py-4 text-sm",
                icon: "h-10 w-10",
            },
        },
    }
);
```

**Status:** ❌ NOT USED ANYWHERE in the current codebase

---

## Button Inventory by File

### 1. HelloPage.jsx

#### Button A: "Get Your API Key & Start Building" (line 295-314)

```jsx
<a href="https://enter.pollinations.ai" target="_blank" rel="noopener noreferrer"
   className="inline-flex items-center gap-2 px-6 py-4 bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md font-headline uppercase text-sm font-black text-offwhite hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all">
```

**Parameters:**

-   Layout: `inline-flex items-center gap-2`
-   Spacing: `px-6 py-4`
-   Background: `bg-offblack`
-   Border: `border-r-4 border-b-4 border-lime`
-   Shadow: `shadow-lime-md` → hover: `shadow-lime-sm`
-   Typography: `font-headline uppercase text-sm font-black`
-   Text color: `text-offwhite`
-   Hover: `hover:translate-x-[2px] hover:translate-y-[2px]`
-   Transition: `transition-all`
-   Icon: ExternalLink SVG (lime stroke)

#### Button B: "Learn More About Sponsorship" (line 315-332)

```jsx
<a href="mailto:hello@pollinations.ai?subject=Sponsorship Inquiry"
   className="inline-flex items-center gap-2 px-6 py-4 bg-lime/90 border-r-4 border-b-4 border-offblack shadow-black-md font-headline uppercase text-sm font-black hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-black-sm transition-all">
```

**Parameters:**

-   Layout: `inline-flex items-center gap-2`
-   Spacing: `px-6 py-4`
-   Background: `bg-lime/90`
-   Border: `border-r-4 border-b-4 border-offblack`
-   Shadow: `shadow-black-md` → hover: `shadow-black-sm`
-   Typography: `font-headline uppercase text-sm font-black`
-   Text color: (default offblack)
-   Hover: `hover:translate-x-[2px] hover:translate-y-[2px]`
-   Transition: `transition-all`
-   Icon: ExternalLink SVG (offblack stroke)

---

### 2. CommunityPage.jsx

#### Button C: "Join Discord" (line 44-63)

```jsx
<a href={SOCIAL_LINKS.discord.url} target="_blank" rel="noopener noreferrer"
   className="inline-flex items-center gap-2 px-6 py-4 bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md font-headline uppercase text-sm font-black text-offwhite hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all">
```

**Parameters:** IDENTICAL to HelloPage Button A

#### Button D: "Contribute" (line 77-96)

```jsx
<a href={SOCIAL_LINKS.github.url} target="_blank" rel="noopener noreferrer"
   className="inline-flex items-center gap-2 px-6 py-4 bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md font-headline uppercase text-sm font-black text-offwhite hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all">
```

**Parameters:** IDENTICAL to HelloPage Button A

---

### 3. DocsPage.jsx

#### Button E: "Full API Docs" (line 51-69)

```jsx
<a href="https://enter.pollinations.ai/api/docs" target="_blank" rel="noopener noreferrer"
   className="inline-flex items-center gap-2 px-6 py-4 bg-lime/90 border-r-4 border-b-4 border-offblack shadow-black-md font-headline uppercase text-sm font-black hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-black-sm transition-all">
```

**Parameters:** IDENTICAL to HelloPage Button B

#### Button F: "Agent Prompt" (line 70-108)

```jsx
<button type="button" onClick={...}
   className="inline-flex items-center gap-2 px-6 py-4 bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md font-headline uppercase text-sm font-black text-offwhite hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all cursor-pointer relative">
```

**Parameters:** IDENTICAL to HelloPage Button A + `cursor-pointer relative`

-   Extra: `relative` for positioned "Copied!" label

#### Button G: "Get Your Key" (DocsPage AuthCard, line 197-223)

```jsx
<a href="https://enter.pollinations.ai" target="_blank" rel="noopener noreferrer"
   className="inline-block bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md px-6 py-4 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all">
```

**Parameters:**

-   Layout: `inline-block` (NOT inline-flex!)
-   Spacing: `px-6 py-4`
-   Background: `bg-offblack`
-   Border: `border-r-4 border-b-4 border-lime`
-   Shadow: `shadow-lime-md` → hover: `shadow-lime-sm`
-   Hover: `hover:translate-x-[2px] hover:translate-y-[2px]`
-   Transition: `transition-all`
-   NO typography classes on button itself (they're on nested elements)

#### Button H: "Copy URL" (DocsPage ImageGenCard, line 469-475)

```jsx
<button type="button" onClick={...}
   className="px-4 py-2 bg-lime/90 border-2 border-rose font-headline uppercase text-xs font-black hover:shadow-rose-md transition-all">
```

**Parameters:**

-   Spacing: `px-4 py-2` (smaller!)
-   Background: `bg-lime/90`
-   Border: `border-2 border-rose` (all sides!)
-   Shadow: none → hover: `shadow-rose-md`
-   Typography: `font-headline uppercase text-xs font-black`
-   Transition: `transition-all`
-   NO hover translate

#### Button I: Prompt selector buttons (DocsPage, line 380-391)

```jsx
<button type="button" onClick={...}
   className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
     selectedPrompt === prompt
       ? "bg-lime/90 border-rose font-black shadow-rose-sm"
       : "bg-offblack/10 border-offblack/30 hover:border-rose"
   }`}>
```

**Parameters (Active):**

-   Spacing: `px-3 py-1.5`
-   Background: `bg-lime/90`
-   Border: `border-2 border-rose`
-   Shadow: `shadow-rose-sm`
-   Typography: `font-mono text-xs font-black`
-   Cursor: `cursor-pointer`

**Parameters (Inactive):**

-   Spacing: `px-3 py-1.5`
-   Background: `bg-offblack/10`
-   Border: `border-2 border-offblack/30`
-   Hover border: `hover:border-rose`
-   Typography: `font-mono text-xs` (NOT font-black when inactive!)
-   Cursor: `cursor-pointer`

#### Button J: Parameter toggle buttons (DocsPage, line 410-422)

```jsx
<button type="button" onClick={...}
   className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
     params.has(param)
       ? "bg-lime/90 border-rose font-black shadow-rose-sm"
       : "bg-offblack/10 border-offblack/30 hover:border-rose"
   }`}>
```

**Parameters:** IDENTICAL to Button I

---

### 4. PlayPage.jsx

#### Button K: "Watch what others are making" toggle (line 215-225)

```jsx
<button type="button" onClick={...}
   className="font-body text-sm text-offblack/40 hover:text-offblack/70 transition-colors whitespace-nowrap">
```

**Parameters:**

-   Typography: `font-body text-sm` (NOT font-headline!)
-   Text color: `text-offblack/40` → hover: `text-offblack/70`
-   Transition: `transition-colors`
-   Whitespace: `whitespace-nowrap`
-   NO background, border, or shadow (text-only button!)

#### Button L: Model selector buttons (line 281-305)

```jsx
<button type="button" onClick={...}
   className={`relative px-2 py-1.5 font-headline text-[0.65rem] uppercase tracking-wider font-black border-2 transition-all ${
     isActive
       ? isImage
         ? "bg-rose/90 border-offblack shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
         : "bg-lime/90 border-offblack shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
       : isImage
         ? "bg-offblack/5 border-offblack/30 hover:border-rose hover:bg-offblack/10"
         : "bg-offblack/5 border-offblack/30 hover:border-lime hover:bg-offblack/10"
   }`}>
```

**Parameters (Active Image Model):**

-   Layout: `relative`
-   Spacing: `px-2 py-1.5` (smallest!)
-   Background: `bg-rose/90`
-   Border: `border-2 border-offblack`
-   Shadow: `shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]`
-   Typography: `font-headline text-[0.65rem] uppercase tracking-wider font-black`

**Parameters (Active Text Model):**

-   Same as above but: `bg-lime/90`

**Parameters (Inactive Image Model):**

-   Background: `bg-offblack/5`
-   Border: `border-2 border-offblack/30`
-   Hover: `hover:border-rose hover:bg-offblack/10`

**Parameters (Inactive Text Model):**

-   Same as inactive image but hover: `hover:border-lime`

#### Button M: "Generate Image/Text" (line 542-561)

```jsx
<button type="button" onClick={...} disabled={!prompt || isLoading}
   className={`w-full mb-6 px-6 py-4 font-headline uppercase text-lg font-black border-r-4 border-b-4 transition-all ${
     isImageModel
       ? "bg-rose border-offblack shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
       : "bg-lime border-offblack shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
   } ${
     !prompt || isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
   }`}>
```

**Parameters (Image Model):**

-   Width: `w-full`
-   Margin: `mb-6`
-   Spacing: `px-6 py-4`
-   Background: `bg-rose`
-   Border: `border-r-4 border-b-4 border-offblack`
-   Shadow: `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]` → hover: `shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]`
-   Typography: `font-headline uppercase text-lg font-black`
-   Hover: `hover:translate-x-[2px] hover:translate-y-[2px]`
-   Disabled: `opacity-50 cursor-not-allowed`
-   Enabled: `cursor-pointer`

**Parameters (Text Model):**

-   Same as above but: `bg-lime`

#### Button N: Image upload remove button (line 356-374)

```jsx
<button type="button" onClick={...}
   className="absolute top-1 right-1 w-6 h-6 bg-rose border-2 border-offblack font-headline text-xs font-black text-offwhite hover:bg-rose/80 transition-colors">
```

**Parameters:**

-   Position: `absolute top-1 right-1`
-   Size: `w-6 h-6`
-   Background: `bg-rose` → hover: `hover:bg-rose/80`
-   Border: `border-2 border-offblack`
-   Typography: `font-headline text-xs font-black text-offwhite`
-   Transition: `transition-colors`

---

### 5. Layout.jsx

#### Button O: Social icon buttons (line 104-118)

```jsx
<a href={url} target="_blank" rel="noopener noreferrer" title={label}
   className="flex-shrink-0 w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-offwhite/80 backdrop-blur-md border-r-4 border-b-4 border-offblack/30 hover:bg-lime/90 hover:border-rose hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] transition-all p-1 md:p-1.5">
```

**Parameters:**

-   Flex: `flex-shrink-0 flex items-center justify-center`
-   Size: `w-6 h-6 md:w-8 md:h-8`
-   Padding: `p-1 md:p-1.5`
-   Background: `bg-offwhite/80 backdrop-blur-md`
-   Border: `border-r-4 border-b-4 border-offblack/30`
-   Hover: `hover:bg-lime/90 hover:border-rose hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)]`
-   Transition: `transition-all`

#### Button P: "Enter" button (line 121-142)

```jsx
<a href="https://enter.pollinations.ai" target="_blank" rel="noopener noreferrer"
   className="flex-shrink-0 h-6 md:h-8 px-2 md:px-3 flex items-center justify-center gap-1 bg-offwhite/80 backdrop-blur-md border-r-4 border-b-4 border-offblack/30 hover:bg-lime/90 hover:border-rose hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] transition-all">
```

**Parameters:**

-   Flex: `flex-shrink-0 flex items-center justify-center gap-1`
-   Height: `h-6 md:h-8`
-   Padding: `px-2 md:px-3`
-   Background: `bg-offwhite/80 backdrop-blur-md`
-   Border: `border-r-4 border-b-4 border-offblack/30`
-   Hover: `hover:bg-lime/90 hover:border-rose hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)]`
-   Transition: `transition-all`

#### Button Q: Footer email copy button (line 189-209)

```jsx
<button type="button" onClick={...}
   className="font-body text-offblack/60 hover:text-offblack transition-colors cursor-pointer relative">
```

**Parameters:**

-   Typography: `font-body` (NOT font-headline!)
-   Text color: `text-offblack/60` → hover: `hover:text-offblack`
-   Transition: `transition-colors`
-   Cursor: `cursor-pointer`
-   Position: `relative`
-   NO background, border, or shadow (text-only button!)

#### Button R: Footer social icons (line 218-231)

```jsx
<a href={url} target="_blank" rel="noopener noreferrer" title={label}
   className="w-6 h-6 flex items-center justify-center hover:bg-lime/90 transition-all p-1">
```

**Parameters:**

-   Size: `w-6 h-6`
-   Flex: `flex items-center justify-center`
-   Padding: `p-1`
-   Hover background: `hover:bg-lime/90`
-   Transition: `transition-all`
-   NO border or shadow

---

## Summary of Unique Button Patterns

### Pattern 1: Primary CTA (Black bg + Lime border)

**Used in:** HelloPage Button A, CommunityPage Buttons C & D, DocsPage Button F

-   `inline-flex items-center gap-2 px-6 py-4`
-   `bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md`
-   `font-headline uppercase text-sm font-black text-offwhite`
-   `hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm`

### Pattern 2: Secondary CTA (Lime bg + Black border)

**Used in:** HelloPage Button B, DocsPage Button E

-   `inline-flex items-center gap-2 px-6 py-4`
-   `bg-lime/90 border-r-4 border-b-4 border-offblack shadow-black-md`
-   `font-headline uppercase text-sm font-black`
-   `hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-black-sm`

### Pattern 3: Small Copy Button

**Used in:** DocsPage Button H (Copy URL)

-   `px-4 py-2 bg-lime/90 border-2 border-rose`
-   `font-headline uppercase text-xs font-black`
-   `hover:shadow-rose-md`

### Pattern 4: Toggle Buttons (mono font)

**Used in:** DocsPage Buttons I & J (prompts, parameters)

-   `px-3 py-1.5 font-mono text-xs border-2`
-   Active: `bg-lime/90 border-rose font-black shadow-rose-sm`
-   Inactive: `bg-offblack/10 border-offblack/30 hover:border-rose`

### Pattern 5: Text-only Toggle

**Used in:** PlayPage Button K, Layout Button Q

-   `font-body text-sm text-offblack/40 hover:text-offblack/70`
-   NO background, border, or shadow

### Pattern 6: Model Selector (tiny)

**Used in:** PlayPage Button L

-   `px-2 py-1.5 font-headline text-[0.65rem] uppercase`
-   Complex 4-state logic (active/inactive × image/text)
-   Smallest button variant

### Pattern 7: Generate Button (full-width, dynamic)

**Used in:** PlayPage Button M

-   `w-full px-6 py-4 font-headline uppercase text-lg font-black`
-   Dynamic color (rose for image, lime for text)
-   Has disabled state

### Pattern 8: Small Icon Button

**Used in:** PlayPage Button N (remove upload)

-   `absolute w-6 h-6 bg-rose border-2 border-offblack`
-   `font-headline text-xs font-black text-offwhite`

### Pattern 9: Header Social Icons

**Used in:** Layout Button O

-   `w-6 h-6 md:w-8 md:h-8 bg-offwhite/80 backdrop-blur-md`
-   `border-r-4 border-b-4 border-offblack/30`
-   Responsive sizing

### Pattern 10: Header Enter Button

**Used in:** Layout Button P

-   Similar to Pattern 9 but with text label

### Pattern 11: Footer Social Icons

**Used in:** Layout Button R

-   Minimal: `w-6 h-6 hover:bg-lime/90`
-   NO border

---

## Component Mapping Strategy

### New Components Needed:

1. **`<Button>` (extend shadcn)** - Variants:
    - `primary` (Pattern 1: black + lime)
    - `secondary` (Pattern 2: lime + black)
    - `copy` (Pattern 3: small copy button)
    - `ghost` (Pattern 5: text-only)
2. **`<ToggleButton>`** - For Pattern 4 & 6
    - Props: `active`, `size`, `font` (headline/mono)
3. **`<IconButton>`** - For Pattern 8, 9, 11
    - Props: `size`, `variant`, `backdrop`
4. **`<GenerateButton>`** - For Pattern 7
    - Props: `modelType` (image/text), `disabled`, `loading`

### Props We Need to Support:

-   ✅ **as** - Component type (button/a)
-   ✅ **variant** - primary/secondary/copy/ghost/toggle
-   ✅ **size** - xs/sm/md/lg
-   ✅ **fullWidth** - boolean
-   ✅ **disabled** - boolean
-   ✅ **loading** - boolean
-   ✅ **active** - boolean (for toggles)
-   ✅ **icon** - React component (for ExternalLink, Copy, etc.)
-   ✅ **iconPosition** - left/right
-   ✅ **backdrop** - boolean (for header buttons)
-   ✅ **children** - button content

---

## Guarantee: Visual Preservation

**Each button will maintain EXACT visual appearance by:**

1. Mapping current className combinations to variant props
2. Preserving all responsive breakpoints (md:, etc.)
3. Keeping all hover states identical
4. Maintaining all shadows, borders, and transitions
5. Testing each button visually before/after

**No pixel will shift. No color will change.**

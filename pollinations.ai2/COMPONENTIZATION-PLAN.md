# Componentization Plan for pollinations.ai2

## Executive Summary

This vibe-coded site has **inconsistent patterns** across text, titles, and buttons. This plan categorizes all UI elements and prioritizes componentization work.

---

## 🎯 Priority Levels

-   **P0 (Critical)** - Buttons with multiple inconsistent implementations
-   **P1 (High)** - Typography hierarchy (titles, headings, body text)
-   **P2 (Medium)** - Cards and containers
-   **P3 (Low)** - Minor elements and edge cases

---

## 1. BUTTONS 🔴 P0 - CRITICAL

### Current State: CHAOS

**8+ different button implementations** found across the site:

#### External Link Buttons (Primary CTA style)

**Location:** HelloPage (lines 295-314, 315-332), CommunityPage (lines 44-63, 77-96), DocsPage (51-69)

```jsx
// Pattern 1: Black bg + lime border + external icon
className =
    "inline-flex items-center gap-2 px-6 py-4 bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md font-headline uppercase text-sm font-black text-offwhite hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all";
```

#### Secondary CTA Buttons

**Location:** HelloPage (line 317), DocsPage (line 55)

```jsx
// Pattern 2: Lime bg + black border
className =
    "inline-flex items-center gap-2 px-6 py-4 bg-lime/90 border-r-4 border-b-4 border-offblack shadow-black-md font-headline uppercase text-sm font-black hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-black-sm transition-all";
```

#### Header Social/Enter Buttons

**Location:** Layout (lines 104-118, 121-142)

```jsx
// Pattern 3: Small social icon buttons
className =
    "flex-shrink-0 w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-offwhite/80 backdrop-blur-md border-r-4 border-b-4 border-offblack/30 hover:bg-lime/90 hover:border-rose hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] transition-all p-1 md:p-1.5";

// Pattern 4: Small "Enter" button
className =
    "flex-shrink-0 h-6 md:h-8 px-2 md:px-3 flex items-center justify-center gap-1 bg-offwhite/80 backdrop-blur-md border-r-4 border-b-4 border-offblack/30 hover:bg-lime/90 hover:border-rose hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] transition-all";
```

#### Footer Buttons

**Location:** Layout (lines 189-209)

```jsx
// Pattern 5: Text-only button (email copy)
className =
    "font-body text-offblack/60 hover:text-offblack transition-colors cursor-pointer relative";
```

#### Interactive Buttons (PlayPage)

**Location:** PlayPage (lines 215-225, 281-305, 542-561)

```jsx
// Pattern 6: View toggle button
className="font-body text-sm text-offblack/40 hover:text-offblack/70 transition-colors whitespace-nowrap"

// Pattern 7: Model selector buttons (VERY complex logic)
className={`relative px-2 py-1.5 font-headline text-[0.65rem] uppercase tracking-wider font-black border-2 transition-all ${
  isActive
    ? isImage
      ? "bg-rose/90 border-offblack shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
      : "bg-lime/90 border-offblack shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
    : isImage
    ? "bg-offblack/5 border-offblack/30 hover:border-rose hover:bg-offblack/10"
    : "bg-offblack/5 border-offblack/30 hover:border-lime hover:bg-offblack/10"
}`}

// Pattern 8: Generate button (dynamic color based on model type)
className={`w-full mb-6 px-6 py-4 font-headline uppercase text-lg font-black border-r-4 border-b-4 transition-all ${
  isImageModel
    ? "bg-rose border-offblack shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
    : "bg-lime border-offblack shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
} ${!prompt || isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
```

#### DocsPage Interactive Buttons

**Location:** DocsPage (lines 380-391, 410-422, 469-475, 546-558, 576-588, 600-611, 728-741)

```jsx
// Pattern 9: Toggle parameter buttons
className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
  selectedPrompt === prompt
    ? "bg-lime/90 border-rose font-black shadow-rose-sm"
    : "bg-offblack/10 border-offblack/30 hover:border-rose"
}`}

// Pattern 10: Copy URL button
className="px-4 py-2 bg-lime/90 border-2 border-rose font-headline uppercase text-xs font-black hover:shadow-rose-md transition-all"
```

#### Auth Card Button

**Location:** DocsPage (lines 197-223)

```jsx
// Pattern 11: Get Your Key link-button
className =
    "inline-block bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md px-6 py-4 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all";
```

#### Agent Prompt Button

**Location:** DocsPage (lines 70-108)

```jsx
// Pattern 12: Copy with notification button
className =
    "inline-flex items-center gap-2 px-6 py-4 bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md font-headline uppercase text-sm font-black text-offwhite hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all cursor-pointer relative";
```

### ⚠️ Issues:

1. **No centralized button component being used** (shadcn/ui button exists but unused)
2. **Inconsistent spacing** (px-2 to px-8, py-1.5 to py-4)
3. **Inconsistent borders** (border-2 vs border-r-4 border-b-4)
4. **Inconsistent shadows** (shadow-lime-md vs shadow-[4px_4px_0px...])
5. **Inconsistent hover states** (translate vs shadow change)
6. **Mixed color schemes** (lime, rose, offblack combinations)
7. **Duplicate external link SVG icons** (repeated 10+ times)

### 🎯 Action Plan:

1. **Create `Button` component variants** (extend existing shadcn button)
2. **Create `IconButton` component** for social/small buttons
3. **Create `ExternalLink` component** with built-in icon
4. **Create `ToggleButton` component** for model/parameter selection
5. **Extract SVG icons** to separate components

---

## 2. TYPOGRAPHY 🟡 P1 - HIGH

### Current State: INCONSISTENT HIERARCHY

#### Page Titles (H1)

**6+ different implementations:**

```jsx
// Pattern 1: HelloPage (line 8)
className = "font-title text-4xl md:text-5xl font-black text-offblack mb-12";

// Pattern 2: CommunityPage (line 21)
className = "font-title text-4xl md:text-5xl font-black text-offblack mb-4";

// Pattern 3: DocsPage (line 33)
className = "font-title text-4xl md:text-5xl font-black text-offblack mb-6";

// Pattern 4: PlayPage (line 212)
className = "font-title text-4xl md:text-5xl font-black text-offblack";
// (no margin specified)
```

**Inconsistency:** Margin bottom varies (mb-4, mb-6, mb-12, none)

#### Section Headings (H2)

**4+ different implementations:**

```jsx
// Pattern 1: With border-left (HelloPage line 33, 51, etc.)
className =
    "font-headline text-2xl md:text-3xl font-black text-offblack mb-4 uppercase tracking-widest border-l-4 border-rose pl-4";

// Pattern 2: With colored text (CommunityPage line 35)
className =
    "font-headline text-xl font-black text-lime mb-4 uppercase tracking-wider";

// Pattern 3: With colored text (CommunityPage line 68)
className =
    "font-headline text-xl font-black text-rose mb-4 uppercase tracking-wider";

// Pattern 4: Large section (CommunityPage line 105)
className =
    "font-headline text-2xl md:text-3xl font-black text-offblack mb-4 uppercase tracking-widest border-l-4 border-rose pl-4";
```

**Inconsistency:**

-   Border-left sometimes present, sometimes not
-   Text color varies (offblack, lime, rose)
-   Tracking varies (tracking-wider vs tracking-widest)
-   Size varies (text-xl vs text-2xl)

#### Subsection Headings (H3)

**Multiple implementations:**

```jsx
// Pattern 1: HelloPage (line 65, 84)
className =
    "font-headline text-lg font-black text-lime mb-4 uppercase tracking-wider";
className =
    "font-headline text-lg font-black text-rose mb-4 uppercase tracking-wider";

// Pattern 2: DocsPage (line 230)
className = "font-headline text-sm font-black text-offblack mb-2";

// Pattern 3: DocsPage (line 161)
className = "font-headline text-xs font-black text-offblack uppercase mb-2";

// Pattern 4: PlayPage (line 249, 311)
className =
    "font-headline text-offblack uppercase text-xs tracking-wider font-black";
```

#### Body Text

**3+ different implementations:**

```jsx
// Pattern 1: Standard (HelloPage line 14)
className = "font-body text-base text-offblack/80 leading-relaxed mb-4";

// Pattern 2: Small (HelloPage line 68)
className = "font-body text-sm text-offblack/70 leading-relaxed";

// Pattern 3: Extra small (DocsPage line 164)
className = "text-xs text-offblack/70 space-y-1";

// Pattern 4: In list (HelloPage line 143)
className =
    "font-body text-sm text-offblack/80 leading-relaxed pl-4 border-l-2 border-lime";
```

#### Labels

**Inconsistent:**

```jsx
// Pattern 1: PlayPage (line 249)
className =
    "font-headline text-offblack uppercase text-xs tracking-wider font-black";

// Pattern 2: DocsPage (line 150)
className =
    "font-headline text-xs uppercase tracking-wider font-black text-offblack mb-3";

// Pattern 3: PlayPage (line 430, 445, 460, 476, 507)
className =
    "block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black";
```

### 🎯 Action Plan:

1. **Create `Title` component** (h1) with consistent margin
2. **Create `Heading` component** (h2, h3) with variant prop
3. **Create `Body` component** with size variants (base, sm, xs)
4. **Create `Label` component** for form labels
5. **Create `ListItem` component** for bordered list items

---

## 3. CARDS & CONTAINERS 🟠 P2 - MEDIUM

### Current State: REPETITIVE PATTERNS

#### Main Content Cards

**All pages use similar wrapper:**

```jsx
// HelloPage, CommunityPage, DocsPage (consistent!)
<div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-rose-lg p-6 md:p-8">
```

**Good:** This is actually consistent! ✅

#### Sub-cards (Colored backgrounds)

**Multiple patterns:**

```jsx
// Pattern 1: Light background (HelloPage line 64, 83)
<div className="bg-offblack/5 p-6">

// Pattern 2: Roadmap cards (HelloPage line 224, 241, 262)
<div className="bg-offblack/5 p-4">

// Pattern 3: Auth key cards (DocsPage line 155, 177)
<div className="bg-offblack/5 p-4">

// Pattern 4: With flex layout (HelloPage line 225)
<div className="flex flex-col md:flex-row gap-3">
```

### 🎯 Action Plan:

1. **Create `PageCard` component** (main wrapper - already consistent)
2. **Create `SubCard` component** with padding variants
3. **Create `InfoCard` component** for feature/info blocks

---

## 4. DIVIDERS 🟢 P3 - LOW

### Current State: CONSISTENT

```jsx
// Used consistently across all pages
<div className="my-12 border-t-2 border-offblack/10" />
```

**Good:** This is consistent! ✅

### 🎯 Action Plan:

1. **Create `Divider` component** (simple extraction)

---

## 5. ICONS & GRAPHICS 🟠 P2 - MEDIUM

### Current State: REPEATED SVG CODE

#### External Link Icon

**Duplicated 10+ times across files:**

```jsx
<svg
    className="w-3.5 h-3.5 stroke-lime"
    fill="none"
    strokeWidth="2.5"
    viewBox="0 0 12 12"
    title="External link"
>
    <path d="M1 11L11 1M11 1H4M11 1v7" strokeLinecap="square" />
</svg>
```

**Locations:** HelloPage (x2), CommunityPage (x2), DocsPage (x2), Layout (x1)

#### Checkmark Icon

**Duplicated in PlayPage:**

```jsx
<svg className="..." fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="4"
        d="M5 13l4 4L19 7"
    />
</svg>
```

**Locations:** PlayPage (lines 491-502, 522-534)

#### Copy Icon

**Used in DocsPage:**

```jsx
<svg
    className="w-4 h-4 stroke-offwhite"
    fill="none"
    strokeWidth="2"
    viewBox="0 0 16 16"
>
    <rect x="5" y="5" width="9" height="9" strokeLinecap="square" />
    <path d="M11 5V3H3v8h2" strokeLinecap="square" />
</svg>
```

**Location:** DocsPage (line 85-102)

### 🎯 Action Plan:

1. **Create `Icon` component library** in `src/icons/`
2. **Extract `ExternalLinkIcon`**
3. **Extract `CheckIcon`**
4. **Extract `CopyIcon`**
5. **Standardize icon sizing props**

---

## 6. INPUTS & FORMS 🟠 P2 - MEDIUM

### Current State: MINIMAL BUT INCONSISTENT

#### Textarea

**Location:** PlayPage (line 314-324)

```jsx
className =
    "w-full p-4 bg-offblack/5 text-offblack font-body resize-none focus:outline-none focus:bg-offblack/10 hover:bg-offblack/10 transition-colors";
```

#### Number Inputs

**Location:** PlayPage (lines 433-442, 448-457, 464-473)

```jsx
className =
    "w-full p-3 bg-offblack/5 text-offblack font-body focus:outline-none focus:bg-offblack/10 hover:bg-offblack/10 transition-colors";
```

#### Checkbox (Custom)

**Location:** PlayPage (lines 479-504, 510-535)

Very complex custom checkbox with peer-checked states.

#### File Input

**Location:** PlayPage (lines 377-410)

Hidden file input with custom label.

### 🎯 Action Plan:

1. **Create `Textarea` component**
2. **Create `Input` component** with variants (text, number)
3. **Create `Checkbox` component** (brutalist style)
4. **Create `FileUpload` component**

---

## 7. NAVIGATION 🟢 P3 - LOW

### Current State: MOSTLY CONSISTENT

#### Tabs (Header)

**Location:** Layout (lines 78-93)

```jsx
// NavLink with brutalist styling - consistent
className={({ isActive }) => `px-2 py-2 md:px-5 md:py-3 font-headline text-[10px] md:text-sm font-black uppercase tracking-wider border-r-4 border-b-4 border-rose transition-all duration-200 no-underline whitespace-nowrap ${...}`}
```

**Good:** Navigation tabs are well-structured ✅

### 🎯 Action Plan:

1. **Extract `NavTab` component** (optional, already clean)

---

## 8. TEXT GENERATION COMPONENTS 🟢 P3 - LOW

### Current State: WELL STRUCTURED

-   `<TextGenerator />` - Used consistently for LLM-generated content ✅
-   `<Content />` - Wrapper for exact vs LLM text ✅

**Good:** These are already componentized properly! ✅

---

## IMPLEMENTATION ROADMAP

### Phase 1: BUTTONS (Week 1) 🔴 P0

-   [ ] Create `Button` component with variants (primary, secondary, ghost, outline, brutal)
-   [ ] Create `IconButton` component
-   [ ] Create `ExternalLink` component
-   [ ] Create `ToggleButton` component
-   [ ] Create icon components (ExternalLinkIcon, CopyIcon, CheckIcon)
-   [ ] Replace all button instances across pages

### Phase 2: TYPOGRAPHY (Week 2) 🟡 P1

-   [ ] Create `Title` component (h1)
-   [ ] Create `Heading` component (h2, h3) with variants
-   [ ] Create `Body` component with size variants
-   [ ] Create `Label` component
-   [ ] Create `ListItem` component
-   [ ] Replace all typography instances

### Phase 3: FORMS & INPUTS (Week 3) 🟠 P2

-   [ ] Create `Textarea` component
-   [ ] Create `Input` component
-   [ ] Create `Checkbox` component
-   [ ] Create `FileUpload` component
-   [ ] Replace all input instances

### Phase 4: CARDS & LAYOUT (Week 4) 🟠 P2

-   [ ] Create `PageCard` component
-   [ ] Create `SubCard` component
-   [ ] Create `InfoCard` component
-   [ ] Create `Divider` component
-   [ ] Replace all card instances

### Phase 5: POLISH & CLEANUP 🟢 P3

-   [ ] Extract any remaining duplicated patterns
-   [ ] Update documentation
-   [ ] Create Storybook or component showcase
-   [ ] Remove unused code

---

## METRICS

**Current State:**

-   ❌ **11+ button patterns** (no reuse)
-   ❌ **6+ title patterns** (inconsistent margins)
-   ❌ **4+ heading patterns** (inconsistent styles)
-   ❌ **10+ duplicated SVG icons**
-   ❌ **Inconsistent spacing and colors** throughout

**Target State:**

-   ✅ **1 Button component** with variants
-   ✅ **1 Title component** with consistent margins
-   ✅ **1 Heading component** with size prop
-   ✅ **Icon library** with reusable components
-   ✅ **Design system** documentation

---

## NOTES

### Good Patterns to Keep:

1. **Main card wrapper** - Already consistent across pages
2. **TextGenerator component** - Already well-structured
3. **Color system** - Well-defined in Tailwind config
4. **Brutalist shadows** - Good aesthetic, just needs consistency

### Anti-Patterns to Fix:

1. **Inline style variations** - Move to component props
2. **Duplicated SVG code** - Extract to components
3. **Inconsistent margins** - Standardize via components
4. **Mixed hover states** - Unify transition patterns
5. **Unused shadcn button** - Either use it or remove it

---

## DECISION LOG

### Why P0 for Buttons?

-   **Most duplicated code** (11+ patterns)
-   **Most visual inconsistency** (affects user trust)
-   **Easiest to extract** (clear boundaries)
-   **Biggest impact** (used everywhere)

### Why P1 for Typography?

-   **Visual hierarchy** affects readability
-   **Many instances** across all pages
-   **Medium complexity** to extract

### Why P2 for Cards?

-   **Less critical** (mostly consistent already)
-   **Lower impact** (less visible to users)

### Why P3 for Dividers/Nav?

-   **Already consistent** (minimal work needed)
-   **Low priority** (not user-facing issues)

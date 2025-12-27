import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../../utils";

// ============================================
// TITLE COMPONENT (H1)
// ============================================
// Page-level titles - largest text on the page
// Used for: Main page titles, hero headings
//
// Examples:
// - HelloPage: "Gen AI with a Human Touch" (spacing="default")
// - DocsPage: "Integrate" (spacing="comfortable")
// - CommunityPage: "Community" (spacing="tight")
// - PlayPage: "Create" / "Watch" (spacing="none" for custom)
// ============================================
const titleVariants = cva(
    "font-title text-4xl md:text-5xl font-black text-text-body-main leading-tight pt-1",
    {
        variants: {
            spacing: {
                default: "mb-8", // Default spacing (reduced from mb-12)
                comfortable: "mb-6", // DocsPage - moderate spacing
                tight: "mb-4", // CommunityPage - compact
                none: "", // PlayPage - custom spacing needed
            },
        },
        defaultVariants: {
            spacing: "default",
        },
    },
);

import type { VariantProps } from "class-variance-authority";

// ... (keep variants definitions)

interface TitleProps
    extends React.HTMLAttributes<HTMLHeadingElement>,
        VariantProps<typeof titleVariants> {
    as?: React.ElementType;
}

export const Title = React.forwardRef<HTMLHeadingElement, TitleProps>(
    ({ className, spacing, as: Comp = "h1", ...props }, ref) => {
        return (
            <Comp
                ref={ref}
                className={cn(titleVariants({ spacing, className }))}
                {...props}
            />
        );
    },
);
Title.displayName = "Title";

// ============================================
// HEADING COMPONENT (H2/H3)
// ============================================
// Section headings - organizes content into sections
// Used for: Major sections, subsections, card titles
//
// Variant examples:
// - section: Main content sections with rose border-left accent
//   → HelloPage: "Pollen: One Simple Credit", "Fuel Your Vision", etc.
//   → DocsPage: "Authentication", "Image Generation", "Text Generation"
//   → Used for: Major page sections (H2)
//
// - lime: Subsection headings with lime color
//   → HelloPage: "Simple & Fast: Buy What You Need" (inside cards)
//   → CommunityPage: "Discord" card title
//   → Used for: Feature cards, positive/action items (H3)
//
// - rose: Subsection headings with rose color
//   → HelloPage: "Our Investment in You: The Sponsorship Program"
//   → CommunityPage: "GitHub" card title
//   → Used for: Feature cards, highlight items (H3)
//
// - simple: Clean headings without border or color
//   → Used for: Nested sections, tertiary headings
// ============================================
const headingVariants = cva(
    "font-headline font-black text-text-body-main uppercase",
    {
        variants: {
            variant: {
                // Section headings with border-left accent (H2 - major sections)
                section:
                    "text-2xl md:text-3xl tracking-widest border-l-4 border-border-brand pl-4",
                // Colored headings (H3 - subsections in cards)
                lime: "text-lg tracking-wider text-text-highlight",
                rose: "text-lg tracking-wider text-text-brand",
                // Simple headings (no border, no color)
                simple: "text-xl md:text-2xl tracking-wider",
            },
            spacing: {
                default: "mb-4", // Standard spacing
                comfortable: "mb-6", // More breathing room
                tight: "mb-2", // Compact, close to content
            },
        },
        defaultVariants: {
            variant: "section",
            spacing: "default",
        },
    },
);

interface HeadingProps
    extends React.HTMLAttributes<HTMLHeadingElement>,
        VariantProps<typeof headingVariants> {
    as?: React.ElementType;
}

export const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
    ({ className, variant, spacing, as: Comp = "h2", ...props }, ref) => {
        return (
            <Comp
                ref={ref}
                className={cn(headingVariants({ variant, spacing, className }))}
                {...props}
            />
        );
    },
);
Heading.displayName = "Heading";

// ============================================
// BODY COMPONENT (Paragraph)
// ============================================
// Body text - main content paragraphs
// Used for: Descriptions, explanations, content blocks
//
// Size examples:
// - base (text-base): Main content paragraphs
//   → HelloPage: Intro paragraphs, section descriptions
//   → Used for: Primary content, feature descriptions
//
// - sm (text-sm): Subtitles, card descriptions
//   → HelloPage: Text inside feature cards
//   → CommunityPage: Discord/GitHub card descriptions
//   → Used for: Supporting text, card content, subtitles
//
// - xs (text-xs): Fine print, captions, notes
//   → DocsPage: API response examples, small notes
//   → Used for: Captions, metadata, fine print
//
// Spacing: Adjust vertical rhythm between paragraphs
// ============================================
const bodyVariants = cva("font-body leading-relaxed", {
    variants: {
        size: {
            base: "text-base text-text-body-main", // Main content
            sm: "text-sm text-text-body-main", // Supporting text
            xs: "text-xs text-text-body-main", // Fine print
        },
        spacing: {
            default: "mb-4", // Standard paragraph spacing
            comfortable: "mb-6", // More breathing room
            tight: "mb-2", // Compact, close together
            none: "", // Custom spacing
        },
    },
    defaultVariants: {
        size: "base",
        spacing: "default",
    },
});

interface BodyProps
    extends React.HTMLAttributes<HTMLParagraphElement>,
        VariantProps<typeof bodyVariants> {
    as?: React.ElementType;
}

export const Body = React.forwardRef<HTMLParagraphElement, BodyProps>(
    ({ className, size, spacing, as: Comp = "p", ...props }, ref) => {
        return (
            <Comp
                ref={ref}
                className={cn(bodyVariants({ size, spacing, className }))}
                {...props}
            />
        );
    },
);
Body.displayName = "Body";

// ============================================
// LABEL COMPONENT (Form labels)
// ============================================
// Form labels - consistent styling for form inputs
// Used for: Input labels, section labels, form controls
//
// Examples:
// - PlayPage: "Models", "Prompt", "Width", "Height", etc.
// - DocsPage: "Pick a prompt:", "Optional parameters:", etc.
//
// Features:
// - Always uppercase with wider tracking (brutalist style)
// - Font-black for emphasis
// - Small size (text-xs) to not compete with inputs
//
// Display:
// - block: Stacked above input (default for forms)
// - inline: Next to input or inline content
// ============================================
const labelVariants = cva(
    "font-headline text-xs uppercase tracking-wider font-black text-text-body-main",
    {
        variants: {
            spacing: {
                default: "mb-2", // Standard label spacing
                comfortable: "mb-3", // More space before input
                tight: "mb-1", // Compact, close to input
                none: "", // Custom spacing
            },
            display: {
                block: "block", // Stacked (typical form layout)
                inline: "inline-block", // Inline with content
            },
        },
        defaultVariants: {
            spacing: "default",
            display: "block",
        },
    },
);

interface LabelProps
    extends React.HTMLAttributes<HTMLLabelElement>,
        VariantProps<typeof labelVariants> {
    as?: React.ElementType;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
    ({ className, spacing, display, as: Comp = "label", ...props }, ref) => {
        return (
            <Comp
                ref={ref}
                className={cn(labelVariants({ spacing, display, className }))}
                {...props}
            />
        );
    },
);
Label.displayName = "Label";

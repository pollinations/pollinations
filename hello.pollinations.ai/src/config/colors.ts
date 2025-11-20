// ============================================
// COLOR SYSTEM
// ============================================

// ============================================
// THEME DEFINITION
// ============================================

export const ThemeDefinition: Record<string, string[]> = {
    "#110518": [
        "text.body.main",
        "button.primary.background",
        "border.strong",
        "shadow.dark.sm",
        "shadow.dark.md",
        "shadow.dark.lg",
        "shadow.dark.xl",
        "logo.main",
    ],
    "#4a5557": ["text.body.secondary"],
    "#6e7a7c": ["text.caption", "text.body.tertiary", "border.main"],
    "#BFCACC": ["surface.card", "border.subtle", "border.faint"],
    "#c7d4d6": ["surface.page", "surface.base"],
    "#dce4e6": ["text.on-color", "input.background", "button.disabled.background"],
    "#ff69b4": [
        "text.brand",
        "indicator.image",
        "border.brand",
        "shadow.brand.sm",
        "shadow.brand.md",
        "shadow.brand.lg",
        "button.focus.ring",
        "logo.shade",
    ],
    "#ecf874": [
        "text.highlight",
        "button.secondary.background",
        "indicator.text",
        "border.highlight",
        "button.hover.overlay",
        "button.active.overlay",
    ],
    "#74f8ec": ["indicator.audio"],
    "#bef264": ["shadow.highlight.sm", "shadow.highlight.md"],
};

// ============================================
// TOKEN GENERATION
// ============================================

function generateTokens(themeDef: typeof ThemeDefinition) {
    const tokens: any = {};

    Object.entries(themeDef).forEach(([hexColor, paths]) => {
        paths.forEach((path) => {
            const parts = path.split(".");
            let current = tokens;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i === parts.length - 1) {
                    current[part] = hexColor;
                } else {
                    current[part] = current[part] || {};
                    current = current[part];
                }
            }
        });
    });

    return tokens as {
        text: {
            body: {
                main: string;
                secondary: string;
                tertiary: string;
            };
            caption: string;
            "on-color": string;
            brand: string;
            highlight: string;
        };
        surface: {
            page: string;
            card: string;
            base: string;
        };
        input: {
            background: string;
        };
        button: {
            primary: { background: string };
            secondary: { background: string };
            disabled: { background: string };
            hover: { overlay: string };
            active: { overlay: string };
            focus: { ring: string };
        };
        indicator: {
            image: string;
            text: string;
            audio: string;
        };
        border: {
            brand: string;
            highlight: string;
            main: string;
            strong: string;
            subtle: string;
            faint: string;
        };
        shadow: {
            brand: { sm: string; md: string; lg: string };
            dark: { sm: string; md: string; lg: string; xl: string };
            highlight: { sm: string; md: string };
        };
        logo: {
            main: string;
            shade: string;
        };
    };
}

export const Tokens = generateTokens(ThemeDefinition);

// ============================================
// TEST UTILITIES
// ============================================

function createMonochromeTokens(color: string): typeof Tokens {
    const allPaths = Object.values(ThemeDefinition).flat();
    const monochromeDef = {
        [color]: allPaths,
    };

    return generateTokens(monochromeDef);
}

export const TestModes = {
    allWhite: () => createMonochromeTokens("#ffffff"),
    allBlack: () => createMonochromeTokens("#000000"),
};

// ============================================
// FONTS
// ============================================

export const Fonts = {
    title: "Maven Pro",
    headline: "Mako",
    body: "Duru Sans",
};

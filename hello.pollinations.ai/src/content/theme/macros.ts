export interface TextMacro {
    primary: string;
    secondary: string;
    tertiary: string;
    caption: string;
    inverse: string;
    brand: string;
    highlight: string;
}

export interface SurfacesMacro {
    page: string;
    card: string;
    base: string;
}

export interface ButtonPrimaryMacro {
    bg: string;
}

export interface ButtonSecondaryMacro {
    bg: string;
}

export interface ButtonGhostMacro {
    // Usually ghost buttons don't have bg, but we might need text color or hover
    // In current system, we have hover overlay and active overlay which are generic
    // Let's stick to what we have in tokens.ts
    hoverOverlay: string;
    activeOverlay: string;
    focusRing: string;
    disabledBg: string;
}

export interface InputsMacro {
    bg: string;
    // text?
}

export interface BordersMacro {
    brand: string;
    highlight: string;
    main: string;
    strong: string;
    subtle: string;
    faint: string;
}

export interface ShadowsMacro {
    brand: {
        sm: string;
        md: string;
        lg: string;
    };
    dark: {
        sm: string;
        md: string;
        lg: string;
        xl: string;
    };
    highlight: {
        sm: string;
        md: string;
    };
}

export interface BrandSpecialMacro {
    logoMain: string;
    logoAccent: string;
    indicatorImage: string;
    indicatorText: string;
    indicatorAudio: string;
}

export interface TypographyMacro {
    title: string;
    headline: string;
    body: string;
}

export interface RadiusMacro {
    button: string;
    card: string;
    input: string;
    subcard: string;
}

export interface MacroConfig {
    text: TextMacro;
    surfaces: SurfacesMacro;
    buttons: {
        primary: ButtonPrimaryMacro;
        secondary: ButtonSecondaryMacro;
        ghost: ButtonGhostMacro;
    };
    inputs: InputsMacro;
    borders: BordersMacro;
    shadows: ShadowsMacro;
    brandSpecial: BrandSpecialMacro;
    typography: TypographyMacro;
    radius: RadiusMacro;
}

export interface TextMacro {
    primary: string;
    secondary: string;
    tertiary: string;
    caption: string;
    inverse: string;
    highlight: string;
}

export interface SurfacesMacro {
    page: string;
    card: string;
    base: string;
}

export interface ButtonPrimaryMacro {
    bg: string;
    border: string;
}

export interface ButtonSecondaryMacro {
    bg: string;
    border: string;
}

export interface ButtonGhostMacro {
    hoverOverlay: string;
    activeOverlay: string;
    focusRing: string;
    disabledBg: string;
}

export interface InputsMacro {
    bg: string;
    border: string;
    placeholder: string;
    text: string;
}

export interface BordersMacro {
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
    brandMain: string;
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

export interface BackgroundMacro {
    base: string;
    element1: string;
    element2: string;
    particle: string;
}

export interface OpacityMacro {
    card: string;
    overlay: string;
    glass: string;
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
    backgrounds: BackgroundMacro;
    typography: TypographyMacro;
    radius: RadiusMacro;
    opacity: OpacityMacro;
}

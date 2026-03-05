export const colors = {
    bg: {
        deep: "#0c0f0a",
        card: "rgba(16, 24, 12, 0.8)",
        cardGlass: "rgba(255,255,255,0.05)",
        cardGlassHover: "rgba(255,255,255,0.08)",
        overlay: "rgba(12, 15, 10, 0.95)",
        overlayLight: "rgba(12, 15, 10, 0.8)",
    },
    lime: {
        main: "#a3e635",
        light: "#bef264",
        dim: "rgba(163, 230, 53, 0.15)",
        border: "rgba(163, 230, 53, 0.3)",
        glow: "rgba(163, 230, 53, 0.6)",
    },
    sage: {
        main: "#86efac",
        dim: "rgba(134, 239, 172, 0.15)",
        border: "rgba(134, 239, 172, 0.3)",
    },
    honey: {
        main: "#fbbf24",
        dim: "rgba(251, 191, 36, 0.15)",
        border: "rgba(251, 191, 36, 0.3)",
    },
    lavender: {
        main: "#c4b5fd",
        light: "#d8b4fe",
        dim: "rgba(196, 181, 253, 0.15)",
        border: "rgba(168, 85, 247, 0.3)",
    },
    text: {
        primary: "#f5f5f4",
        secondary: "rgba(245, 245, 244, 0.8)",
        muted: "rgba(245, 245, 244, 0.7)",
        subtle: "rgba(255, 255, 255, 0.5)",
        disabled: "rgba(255, 255, 255, 0.4)",
    },
    border: {
        light: "rgba(255, 255, 255, 0.1)",
        medium: "rgba(255, 255, 255, 0.15)",
        strong: "rgba(255, 255, 255, 0.2)",
        hover: "rgba(255, 255, 255, 0.3)",
    },
    status: {
        success: {
            main: "#4ade80",
            bg: "rgba(34, 197, 94, 0.1)",
            border: "rgba(34, 197, 94, 0.3)",
        },
        warning: {
            main: "#fbbf24",
            bg: "rgba(251, 191, 36, 0.1)",
            border: "rgba(251, 191, 36, 0.3)",
        },
        error: {
            main: "#f87171",
            bg: "rgba(239, 68, 68, 0.1)",
            border: "rgba(239, 68, 68, 0.3)",
        },
        info: {
            main: "#818cf8",
            bg: "rgba(88, 101, 242, 0.15)",
            border: "rgba(88, 101, 242, 0.3)",
        },
        neutral: {
            main: "#d1d5db",
            bg: "rgba(156, 163, 175, 0.1)",
            border: "rgba(156, 163, 175, 0.2)",
        },
    },
    category: {
        "AI/ML": {
            bg: "rgba(251, 191, 36, 0.1)",
            text: "#fbbf24",
            border: "rgba(251, 191, 36, 0.3)",
        },
        Infrastructure: {
            bg: "rgba(163, 230, 53, 0.1)",
            text: "#a3e635",
            border: "rgba(163, 230, 53, 0.3)",
        },
        "Game Development": {
            bg: "rgba(168, 85, 247, 0.1)",
            text: "#d8b4fe",
            border: "rgba(168, 85, 247, 0.3)",
        },
        "DevOps/Security": {
            bg: "rgba(239, 68, 68, 0.1)",
            text: "#f87171",
            border: "rgba(239, 68, 68, 0.3)",
        },
        "Developer Tools": {
            bg: "rgba(16, 185, 129, 0.1)",
            text: "#34d399",
            border: "rgba(16, 185, 129, 0.3)",
        },
        default: {
            bg: "rgba(156, 163, 175, 0.1)",
            text: "#9ca3af",
            border: "rgba(156, 163, 175, 0.3)",
        },
    },
    social: {
        discord: {
            main: "#818cf8",
            bg: "rgba(88, 101, 242, 0.15)",
            border: "rgba(88, 101, 242, 0.3)",
        },
        github: {
            main: "#fff",
            bg: "rgba(255, 255, 255, 0.1)",
            border: "rgba(255, 255, 255, 0.2)",
        },
        linkedin: {
            main: "#0077b5",
        },
    },
};

export const gradients = {
    cardAccent: "linear-gradient(90deg, #a3e635, #86efac, #fbbf24)",
    textHeading: "linear-gradient(to bottom right, #f5f5f4, #a1a1aa)",
    textHero:
        "linear-gradient(135deg, #f5f5f4 0%, #a3e635 30%, #86efac 60%, #fbbf24 100%)",
    textAccent:
        "linear-gradient(135deg, #a3e635 0%, #86efac 50%, #fbbf24 100%)",
    bgPage: "linear-gradient(135deg, #0c0f0a 0%, #0f1410 50%, #0c0f0a 100%)",
    bgCard: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
    bgOverlay:
        "linear-gradient(135deg, rgba(12, 15, 10, 0.95) 0%, rgba(12, 15, 10, 0.8) 100%)",
    glowLime:
        "radial-gradient(circle, rgba(163, 230, 53, 0.08) 0%, rgba(0,0,0,0) 70%)",
    glowWhite:
        "radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0) 70%)",
};

export const shadows = {
    card: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
    cardHover: "0 20px 40px -10px rgba(0,0,0,0.4)",
    cardLarge: "0 25px 50px -10px rgba(0,0,0,0.5)",
    glowLime: "0 0 20px rgba(163, 230, 53, 0.6)",
    glowWhite: "0 0 20px rgba(255,255,255,0.6)",
    button: "0 8px 25px rgba(0,0,0,0.3)",
};

export const fonts = {
    body: '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
    display: '"Space Grotesk", "DM Sans", sans-serif',
    mono: "monospace",
};

export const getCategoryColor = (category) => {
    return colors.category[category] || colors.category.default;
};

export const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
        case "Beginner":
            return colors.status.success;
        case "Intermediate":
            return colors.status.warning;
        case "Advanced":
            return colors.status.error;
        default:
            return colors.status.neutral;
    }
};

export const sx = {
    card: {
        background: gradients.bgCard,
        backdropFilter: "blur(20px)",
        border: `1px solid ${colors.border.light}`,
        borderRadius: "16px",
        color: colors.text.primary,
        transition: "all 0.3s ease",
    },
    cardHover: {
        transform: "translateY(-4px)",
        borderColor: colors.border.hover,
        boxShadow: shadows.cardHover,
    },
    buttonGlass: {
        bgcolor: "rgba(255,255,255,0.15)",
        color: colors.text.primary,
        textTransform: "none",
        fontWeight: 600,
        border: `1px solid ${colors.border.strong}`,
        "&:hover": {
            bgcolor: "rgba(255,255,255,0.25)",
            transform: "translateY(-2px)",
        },
    },
    buttonPrimary: {
        bgcolor: colors.lime.dim,
        color: colors.lime.main,
        textTransform: "none",
        fontWeight: 600,
        border: `1px solid ${colors.lime.border}`,
        "&:hover": {
            bgcolor: "rgba(163, 230, 53, 0.25)",
            borderColor: "rgba(163, 230, 53, 0.5)",
        },
    },
    chipTech: {
        fontSize: "0.7rem",
        height: "24px",
        background: colors.bg.cardGlassHover,
        color: "#e5e7eb",
        border: `1px solid ${colors.border.light}`,
        fontWeight: 500,
    },
};

export default {
    colors,
    gradients,
    shadows,
    fonts,
    getCategoryColor,
    getDifficultyColor,
    sx,
};
export const colors = {
    bg: {
        deep: "#0c0f0a",
        cardGlass: "rgba(255,255,255,0.05)",
        cardGlassHover: "rgba(255,255,255,0.08)",
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
    },
    lavender: {
        dim: "rgba(196, 181, 253, 0.15)",
    },
    text: {
        primary: "#f5f5f4",
        secondary: "rgba(245, 245, 244, 0.8)",
        muted: "rgba(245, 245, 244, 0.7)",
        subtle: "rgba(255, 255, 255, 0.5)",
    },
    border: {
        light: "rgba(255, 255, 255, 0.1)",
        medium: "rgba(255, 255, 255, 0.15)",
        hover: "rgba(255, 255, 255, 0.3)",
    },
    status: {
        error: {
            main: "#f87171",
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
};

export const gradients = {
    cardAccent: "linear-gradient(90deg, #a3e635, #86efac, #fbbf24)",
    textHeading: "linear-gradient(to bottom right, #f5f5f4, #a1a1aa)",
    textHero:
        "linear-gradient(135deg, #f5f5f4 0%, #a3e635 30%, #86efac 60%, #fbbf24 100%)",
    textAccent:
        "linear-gradient(135deg, #a3e635 0%, #86efac 50%, #fbbf24 100%)",
    bgOverlay:
        "linear-gradient(135deg, rgba(12, 15, 10, 0.95) 0%, rgba(12, 15, 10, 0.8) 100%)",
    glowLime:
        "radial-gradient(circle, rgba(163, 230, 53, 0.08) 0%, rgba(0,0,0,0) 70%)",
};

export const getCategoryColor = (category) => {
    return colors.category[category] || colors.category.default;
};

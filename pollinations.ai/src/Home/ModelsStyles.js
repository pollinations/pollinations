// Psychedelic Gen-Z style for Models page - matching auth.pollinations.ai
export const modelsStyles = {
    container: {
        fontFamily: "'Space Grotesk', sans-serif",
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "40px 20px",
        backgroundColor: "#ffffff",
        minHeight: "100vh",
    },
    
    pageHeader: {
        position: "relative",
        zIndex: 1,
        fontSize: "clamp(2rem, 6vw, 3rem)",
        marginBottom: "1.5rem",
        fontWeight: 700,
        display: "inline-block",
        "&::after": {
            content: '""',
            position: "absolute",
            width: "100%",
            height: "0.5em",
            bottom: "0.1em",
            left: 0,
            zIndex: -1,
            backgroundColor: "#05ffa1",
            transform: "skew(-15deg)",
            animation: "highlight-shift 8s infinite linear",
        },
    },
    
    tabContainer: {
        marginTop: "2rem",
        marginBottom: "2rem",
        display: "flex",
        gap: "1rem",
        flexWrap: "wrap",
    },
    
    tab: {
        base: {
            padding: "12px 32px",
            border: "none",
            borderRadius: "30px",
            fontSize: "1.1rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            transition: "all 0.3s",
            position: "relative",
            overflow: "hidden",
            zIndex: 1,
        },
        active: {
            background: "linear-gradient(135deg, #ff61d8, #05ffa1, #ffcc00)",
            backgroundSize: "300% 300%",
            animation: "login-gradient 6s ease infinite",
            color: "white",
        },
        inactive: {
            backgroundColor: "#f0f0f0",
            color: "#000000",
            border: "2px solid #ddd",
            "&:hover": {
                backgroundColor: "#e0e0e0",
            },
        },
    },
    
    modelGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "2rem",
        marginTop: "2rem",
    },
    
    modelCard: {
        background: "white",
        padding: "24px",
        borderRadius: "16px",
        border: "3px solid #ff61d8",
        animation: "border-shift 10s infinite linear",
        transition: "all 0.3s",
        "&:hover": {
            transform: "translateY(-5px)",
            boxShadow: "0 8px 20px rgba(0, 0, 0, 0.1)",
        },
    },
    
    modelName: {
        fontSize: "1.5rem",
        fontWeight: 700,
        marginBottom: "0.5rem",
        color: "#000000",
    },
    
    modelDescription: {
        fontSize: "1rem",
        color: "#666666",
        marginBottom: "1rem",
        lineHeight: "1.5",
    },
    
    tierBadge: {
        display: "inline-block",
        padding: "6px 16px",
        borderRadius: "20px",
        fontSize: "0.85rem",
        fontWeight: 700,
        marginBottom: "1rem",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
    },
    
    tierColors: {
        anonymous: {
            background: "linear-gradient(135deg, #a8e6cf, #7ed56f)",
            color: "white",
        },
        seed: {
            background: "linear-gradient(135deg, #7ed56f, #28b485)",
            color: "white",
        },
        flower: {
            background: "linear-gradient(135deg, #ff61d8, #ff3b5c)",
            color: "white",
        },
        nectar: {
            background: "linear-gradient(135deg, #ffcc00, #ff9500)",
            color: "white",
        },
    },
    
    featureList: {
        listStyle: "none",
        padding: 0,
        margin: 0,
    },
    
    featureItem: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 0",
        fontSize: "0.95rem",
        color: "#444444",
    },
    
    featureIcon: {
        fontSize: "1.2rem",
    },
    
    noModels: {
        textAlign: "center",
        padding: "3rem",
        fontSize: "1.2rem",
        color: "#666666",
        fontStyle: "italic",
    },
    
    // Keyframes animations (to be added via CSS)
    "@keyframes border-shift": {
        "0%": { borderColor: "#ff61d8" },
        "33%": { borderColor: "#05ffa1" },
        "66%": { borderColor: "#ffcc00" },
        "100%": { borderColor: "#ff61d8" },
    },
    
    "@keyframes highlight-shift": {
        "0%": { backgroundColor: "#05ffa1" },
        "33%": { backgroundColor: "#ffcc00" },
        "66%": { backgroundColor: "#ff61d8" },
        "100%": { backgroundColor: "#05ffa1" },
    },
    
    "@keyframes login-gradient": {
        "0%": { backgroundPosition: "0% 50%" },
        "50%": { backgroundPosition: "100% 50%" },
        "100%": { backgroundPosition: "0% 50%" },
    },
};

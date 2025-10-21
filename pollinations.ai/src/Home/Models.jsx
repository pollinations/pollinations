import React, { useState, useEffect } from "react";
import { Box, Container, Typography, CircularProgress } from "@mui/material";
import { getAllModels } from "../utils/getModels";
import { modelsStyles } from "./ModelsStyles";

// Add CSS animations
const styleSheet = document.createElement("style");
styleSheet.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap');

@keyframes border-shift {
    0% { border-color: #ff61d8; }
    33% { border-color: #05ffa1; }
    66% { border-color: #ffcc00; }
    100% { border-color: #ff61d8; }
}

@keyframes highlight-shift {
    0% { background-color: #05ffa1; }
    33% { background-color: #ffcc00; }
    66% { background-color: #ff61d8; }
    100% { background-color: #05ffa1; }
}

@keyframes login-gradient {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

.page-header::after {
    content: "";
    position: absolute;
    width: 100%;
    height: 0.5em;
    bottom: 0.1em;
    left: 0;
    z-index: -1;
    background-color: #05ffa1;
    transform: skew(-15deg);
    animation: highlight-shift 8s infinite linear;
}

.model-card {
    animation: border-shift 10s infinite linear;
}

.tab-active {
    background: linear-gradient(135deg, #ff61d8, #05ffa1, #ffcc00);
    background-size: 300% 300%;
    animation: login-gradient 6s ease infinite;
}
`;
document.head.appendChild(styleSheet);

const ModelCard = ({ model, type }) => {
    const getTierColor = (tier) => {
        const colors = modelsStyles.tierColors;
        return colors[tier] || colors.seed;
    };
    
    const tierStyle = getTierColor(model.tier);
    
    // Get feature icons and text based on model properties
    const features = [];
    
    if (type === "text") {
        if (model.input_modalities?.includes("text")) features.push({ icon: "💬", text: "Text Input" });
        if (model.input_modalities?.includes("image")) features.push({ icon: "🖼️", text: "Image Input" });
        if (model.input_modalities?.includes("audio")) features.push({ icon: "🎵", text: "Audio Input" });
        if (model.output_modalities?.includes("text")) features.push({ icon: "📝", text: "Text Output" });
        if (model.output_modalities?.includes("audio")) features.push({ icon: "🔊", text: "Audio Output" });
        if (model.tools) features.push({ icon: "🔧", text: "Tool Support" });
        if (model.reasoning) features.push({ icon: "🧠", text: "Reasoning" });
        if (model.uncensored) features.push({ icon: "🔓", text: "Uncensored" });
        if (model.community) features.push({ icon: "👥", text: "Community" });
    } else if (type === "image") {
        features.push({ icon: "🎨", text: "Image Generation" });
        if (model.enhance) features.push({ icon: "✨", text: "Enhancement" });
        if (model.maxSideLength) features.push({ icon: "📐", text: `Max: ${model.maxSideLength}px` });
    }
    
    return (
        <Box
            className="model-card"
            sx={{
                ...modelsStyles.modelCard,
                position: "relative",
            }}
        >
            <Typography sx={modelsStyles.modelName}>
                {model.name}
            </Typography>
            
            <Typography sx={modelsStyles.modelDescription}>
                {model.description || "No description available"}
            </Typography>
            
            <Box
                sx={{
                    ...modelsStyles.tierBadge,
                    ...tierStyle,
                }}
            >
                {model.tier === "anonymous" ? "🌱 FREE" : `${getTierEmoji(model.tier)} ${model.tier.toUpperCase()}`}
            </Box>
            
            {features.length > 0 && (
                <Box component="ul" sx={modelsStyles.featureList}>
                    {features.map((feature, index) => (
                        <Box
                            component="li"
                            key={index}
                            sx={modelsStyles.featureItem}
                        >
                            <span style={modelsStyles.featureIcon}>{feature.icon}</span>
                            <span>{feature.text}</span>
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
};

const getTierEmoji = (tier) => {
    const emojiMap = {
        anonymous: "🌱",
        seed: "🌱",
        flower: "🌸",
        nectar: "🍯",
    };
    return emojiMap[tier] || "🌱";
};

const Models = () => {
    const [activeTab, setActiveTab] = useState("text");
    const [models, setModels] = useState({ textModels: [], imageModels: [] });
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const loadModels = async () => {
            setLoading(true);
            const data = await getAllModels();
            setModels(data);
            setLoading(false);
        };
        
        loadModels();
    }, []);
    
    const displayModels = activeTab === "text" ? models.textModels : models.imageModels;
    
    return (
        <Box sx={modelsStyles.container}>
            <Container maxWidth="lg">
                <Typography
                    component="h1"
                    className="page-header"
                    sx={{
                        ...modelsStyles.pageHeader,
                        position: "relative",
                    }}
                >
                    🤖 Available Models 🌸
                </Typography>
                
                <Typography
                    sx={{
                        fontSize: "1.2rem",
                        color: "#666",
                        marginBottom: "2rem",
                        fontFamily: "'Space Grotesk', sans-serif",
                    }}
                >
                    Explore our collection of AI models for text and image generation
                </Typography>
                
                <Box sx={modelsStyles.tabContainer}>
                    <button
                        className={activeTab === "text" ? "tab-active" : ""}
                        onClick={() => setActiveTab("text")}
                        style={{
                            ...modelsStyles.tab.base,
                            ...(activeTab === "text" ? { color: "white" } : modelsStyles.tab.inactive),
                        }}
                    >
                        💬 Text Models ({models.textModels.length})
                    </button>
                    <button
                        className={activeTab === "image" ? "tab-active" : ""}
                        onClick={() => setActiveTab("image")}
                        style={{
                            ...modelsStyles.tab.base,
                            ...(activeTab === "image" ? { color: "white" } : modelsStyles.tab.inactive),
                        }}
                    >
                        🎨 Image Models ({models.imageModels.length})
                    </button>
                </Box>
                
                {loading ? (
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            minHeight: "300px",
                        }}
                    >
                        <CircularProgress
                            sx={{ color: "#ff61d8" }}
                            size={60}
                        />
                    </Box>
                ) : displayModels.length === 0 ? (
                    <Box sx={modelsStyles.noModels}>
                        No models available in this category
                    </Box>
                ) : (
                    <Box sx={modelsStyles.modelGrid}>
                        {displayModels.map((model, index) => (
                            <ModelCard
                                key={index}
                                model={model}
                                type={activeTab}
                            />
                        ))}
                    </Box>
                )}
            </Container>
        </Box>
    );
};

export default Models;

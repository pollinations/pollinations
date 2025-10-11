import React, { useState } from "react";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import {
    SectionContainer,
    SectionMainContent,
    SectionSubContainer,
    SectionTitleStyle,
} from "../components/SectionContainer";
import { SectionBG, Colors, Fonts } from "../config/global";
import { ImageFeed } from "../components/Feeds/ImageFeed";
import { TextFeed } from "../components/Feeds/TextFeed";
import { GeneralButton } from "../components/GeneralButton.jsx";

/**
 * Feeds Component:
 * Renders a unified section containing either the Image or Text feed,
 * with a toggle control using GeneralButton.
 */
export const Feeds = () => {
    const [activeMode, setActiveMode] = useState("image");
    // Add state to track button hover
    const [isHovered, setIsHovered] = useState(false);

    // Add theme and media query hook to detect screen size
    const theme = useTheme();
    const isMdUp = useMediaQuery(theme.breakpoints.up("md"));

    const handleModeChange = (mode) => {
        setActiveMode(mode);
        // TODO: Add analytics tracking for mode switch if needed
        // trackEvent({ action: 'switch_feed_mode', category: 'feeds', value: mode });
    };

    const currentBackgroundConfig =
        activeMode === "image" ? SectionBG.feedImage : SectionBG.feedText;

    const sectionContainerStyle = {
        backgroundColor: currentBackgroundConfig.color || "transparent",
        backgroundImage: currentBackgroundConfig.image
            ? `url(${currentBackgroundConfig.image})`
            : "none",
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "repeat",
    };

    return (
        <SectionContainer id="feeds" style={sectionContainerStyle}>
            {/* Title Section with Single Toggle Button and Title */}
            <SectionSubContainer
                style={{
                    display: "center",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "1em",
                }}
                flexDirection="row"
            >
                <GeneralButton
                    handleClick={() => {
                        const nextMode =
                            activeMode === "image" ? "text" : "image";
                        handleModeChange(nextMode);
                    }}
                    // Add mouse enter/leave handlers to toggle hover state
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    // Set these props directly which GeneralButton is designed to handle
                    borderColor={isHovered ? Colors.lime : Colors.lime}
                    textColor={isHovered ? Colors.lime : Colors.lime}
                    borderRadius="0em"
                    fontSize={isMdUp ? "8em" : "4em"}
                    style={{
                        // Add box shadow on hover using the isHovered state
                        boxShadow: isHovered
                            ? `0 0 10px ${Colors.offblack}`
                            : "none",
                        transition: "all 0.3s ease",
                        padding: "0em 0.2em",
                    }}
                >
                    {activeMode === "text" ? "text" : "image"}
                </GeneralButton>
                <SectionTitleStyle>Feed</SectionTitleStyle>
            </SectionSubContainer>

            {/* Conditional Feed Rendering */}
            <Box
                sx={{
                    display: activeMode === "image" ? "block" : "none",
                    width: "100%",
                    maxWidth: "1000px",
                    margin: "0 auto",
                    alignSelf: "center",
                }}
            >
                <ImageFeed mode={activeMode} />
            </Box>
            <Box
                sx={{
                    display: activeMode === "text" ? "block" : "none",
                    width: "100%",
                    maxWidth: "1000px",
                    margin: "0 auto",
                    alignSelf: "center",
                }}
            >
                <TextFeed mode={activeMode} />
            </Box>
        </SectionContainer>
    );
};

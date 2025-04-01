import React, { useState } from "react"
import { Box, useMediaQuery, useTheme } from "@mui/material"
import {
  SectionContainer,
  SectionMainContent,
  SectionSubContainer,
  SectionTitleStyle,
} from "../components/SectionContainer"
import { SectionBG, Colors, Fonts } from "../config/global"
import { ImageFeed } from "../components/Feeds/ImageFeed"
import { TextFeed } from "../components/Feeds/TextFeed"
import { GeneralButton } from "../components/GeneralButton"

/**
 * Feeds Component:
 * Renders a unified section containing either the Image or Text feed,
 * with a toggle control using GeneralButton.
 */
export const Feeds = () => {
  const [activeMode, setActiveMode] = useState("image")
  // Add state to track button hover
  const [isHovered, setIsHovered] = useState(false)
  
  // Add theme and media query hook to detect screen size
  const theme = useTheme()
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'))

  const handleModeChange = (mode) => {
    setActiveMode(mode)
    // TODO: Add analytics tracking for mode switch if needed
    // trackEvent({ action: 'switch_feed_mode', category: 'feeds', value: mode });
  }

  const currentBackgroundConfig = activeMode === "image" ? SectionBG.feedImage : SectionBG.feedText

  const sectionContainerStyle = {
    backgroundColor: currentBackgroundConfig.color || "transparent",
    backgroundImage: currentBackgroundConfig.image
      ? `url(${currentBackgroundConfig.image})`
      : "none",
    backgroundSize: "cover",
    backgroundPosition: "center center",
    backgroundRepeat: "repeat",
  }

  // Base styles to be applied via sx prop on GeneralButton
  const baseButtonSx = {
    fontFamily: Fonts.title,
    letterSpacing: "0.1em",
    fontWeight: 600,
    padding: "8px 24px",
    textTransform: "none",
    borderRadius: "20px",
  }

  return (
    <SectionContainer id="feeds" style={sectionContainerStyle}>
      <SectionMainContent>
        {/* Title Section with Single Toggle Button and Title */}
        <SectionSubContainer
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: "20px",
            gap: '1em',
            width: '100%'
          }}
          flexDirection={isMdUp ? "row" : "column"}
        >
          <GeneralButton
            handleClick={() => {
              const nextMode = activeMode === "image" ? "text" : "image"
              handleModeChange(nextMode)
            }}
            // Add mouse enter/leave handlers to toggle hover state
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            // Set these props directly which GeneralButton is designed to handle
            backgroundColor={isHovered ? Colors.lime : Colors.offblack}
            textColor={isHovered ? Colors.offblack : Colors.lime}
            borderColor={Colors.lime}
            borderRadius="0.5em"
            fontSize={isMdUp ? "8em" : "4em"}
            // Add custom style object with fixed width
            style={{
              // Set fixed width based on the longer text "Image"
              minWidth: isMdUp ? "400px" : "210px",
              width: "auto",
              maxWidth: "150px",
              fontWeight: "bold",
              maxHeight: "160px",
              padding: "0.7em 1.8em",
              // Add box shadow on hover using the isHovered state
              boxShadow: isHovered ? `0 0 10px ${Colors.offblack}` : "none",
              transition: "all 0.3s ease",
            }}
          >
            {/* Text changes based on hover state */}
            {isHovered 
              ? `${activeMode === "image" ? "Text" : "Image"}` // Show target mode when hovered
              : `${activeMode === "image" ? "Image" : "Text"}` // Show current mode normally
            }
          </GeneralButton>
          <SectionTitleStyle>
              Feed
            </SectionTitleStyle>
        </SectionSubContainer>

        {/* Conditional Feed Rendering */}
        <Box sx={{ 
          display: activeMode === "image" ? "block" : "none", 
          width: '100%', 
          alignSelf: 'stretch' 
        }}>
          <ImageFeed />
        </Box>
        <Box sx={{ 
          display: activeMode === "text" ? "block" : "none",
          width: '100%', 
          alignSelf: 'stretch' 
        }}>
          <TextFeed />
        </Box>
      </SectionMainContent>
    </SectionContainer>
  )
}

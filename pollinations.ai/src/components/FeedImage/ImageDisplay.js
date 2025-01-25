import React, { memo } from "react"
import { Typography, Link, Paper, useMediaQuery, useTheme } from "@mui/material"
import PromptTooltip from "../PromptTooltip"
import styled from "@emotion/styled"
import { Colors } from "../../config/global"
import { trackEvent } from "../../config/analytics"

/**
 * ImageDisplay
 * Displays an image with a tooltip and tracks click events.
 * Tracks user interactions when the image is clicked.
 */
export const ImageDisplay = memo(function ImageDisplay({ image }) {
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"))
  const handleImageClick = (e) => {
    e.preventDefault()
    trackEvent({
      action: "Image_Click",
      category: "User_Interactions",
      label: "Image_Display",
      value: 1,
    })
    window.open(image["imageURL"], "_blank")
  }

  const ImageContent = (
    <PromptTooltip title={image["prompt"]} seed={image["seed"]}>
      <ImageStyle src={image["imageURL"]} alt="generative_image" onClick={handleImageClick} />
    </PromptTooltip>
  )

  return (
    <ImageContainer
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        boxShadow: "none",
        backgroundColor: Colors.offblack,
      }}
    >
      {image ? (
        isDesktop ? (
          <Link href={image["imageURL"]} target="_blank" rel="noopener" onClick={handleImageClick}>
            {ImageContent}
          </Link>
        ) : (
          ImageContent
        )
      ) : (
        <Typography component="div" variant="h6" color="textSecondary">
          Loading image...
        </Typography>
      )}
    </ImageContainer>
  )
})

const ImageStyle = styled.img`
  height: 600px;
  max-width: 100%;
  object-fit: contain;
`
const ImageContainer = styled(Paper)`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
`

import React, { memo } from "react"
import { Typography, Link, useMediaQuery, useTheme, Box } from "@mui/material"
import PromptTooltip from "../PromptTooltip"
import styled from "@emotion/styled"
import { trackEvent } from "../../config/analytics.js"
import { Colors, Fonts } from "../../config/global"

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
      action: "click_image",
      category: "feed",
    })
    window.open(image["imageURL"], "_blank")
  }

  // Show error if image has error property
  if (image?.error) {
    // Check if this is a FORBIDDEN error (model not allowed for API key)
    const isForbiddenError = image.errorCode === "FORBIDDEN"
    // Check if this is a rate limit error
    const isRateLimitError =
      image.error?.includes?.("Rate limit") ||
      image.message?.includes?.("Rate limit") ||
      (typeof image.error === "string" && image.error.includes("Rate limit"))

    // Determine error type for display
    let errorTitle = "Something Went Wrong"
    let errorMessage = "Please try again later or select a different model."
    let showEnterLink = false

    if (isForbiddenError) {
      errorTitle = "Model Unavailable"
      errorMessage = "This model is not available in the playground."
      showEnterLink = true
    } else if (isRateLimitError) {
      errorTitle = "Rate Limit Reached"
      errorMessage = "You've reached the rate limit for this playground."
      showEnterLink = true
    }

    return (
      <ImageContainer
        sx={{
          display: "flex",
          flexDirection: "column",
          position: "relative",
          boxShadow: "none",
          backgroundColor: "transparent",
          width: "100%",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
            padding: "40px 20px",
            minHeight: isDesktop ? "600px" : "400px",
            borderRadius: "8px",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <Typography
              sx={{
                color: Colors.lime,
                fontFamily: Fonts.parameter,
                fontSize: "1.3em",
                fontWeight: "bold",
                marginBottom: "16px",
              }}
            >
              {errorTitle}
            </Typography>
            <Typography
              sx={{
                color: Colors.offwhite,
                fontFamily: Fonts.parameter,
                fontSize: "1em",
                textAlign: "center",
                maxWidth: "500px",
                lineHeight: 1.6,
              }}
            >
              {errorMessage}
              {showEnterLink && (
                <>
                  <br />
                  <br />
                  To {isForbiddenError ? "use it" : "avoid rate limits"}, create an account at{" "}
                  <Link
                    href="https://enter.pollinations.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      color: Colors.lime,
                      textDecoration: "underline",
                      "&:hover": {
                        color: Colors.lime,
                        opacity: 0.8,
                      },
                    }}
                    onClick={() =>
                      trackEvent({
                        action: "click_enter_link_from_error",
                        category: "feed",
                      })
                    }
                  >
                    enter.pollinations.ai
                  </Link>
                </>
              )}
            </Typography>
          </Box>
        </Box>
      </ImageContainer>
    )
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
        position: "relative",
        boxShadow: "none",
        backgroundColor: "transparent",
        width: "100%",
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
  width: 100%;
  max-width: 100%;
  object-fit: contain;

  ${({ theme }) => theme.breakpoints.down("md")} {
    height: 400px;
  }
`
const ImageContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 1.5em;
`

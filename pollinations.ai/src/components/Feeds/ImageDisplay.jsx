import React, { memo, useState, useEffect } from "react";
import { Typography, Link, useMediaQuery, useTheme, Alert } from "@mui/material";
import PromptTooltip from "../PromptTooltip";
import styled from "@emotion/styled";
import { trackEvent } from "../../config/analytics.js";

/**
 * ImageDisplay
 * Displays an image with a tooltip and tracks click events.
 * Tracks user interactions when the image is clicked.
 * Pre-fetches images to detect and display API errors.
 */
export const ImageDisplay = memo(function ImageDisplay({ image }) {
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
    const [imageError, setImageError] = useState(null);
    const [imageLoaded, setImageLoaded] = useState(false);

    // Pre-fetch image to check for errors
    useEffect(() => {
        if (!image?.imageURL) return;

        setImageError(null);
        setImageLoaded(false);

        // Try to fetch the image to check for errors
        fetch(image.imageURL)
            .then(async (response) => {
                if (!response.ok) {
                    // Try to parse error message from JSON
                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.includes("application/json")) {
                        const errorData = await response.json();
                        setImageError(errorData.error || `Error ${response.status}: ${response.statusText}`);
                    } else {
                        setImageError(`Error ${response.status}: ${response.statusText}`);
                    }
                } else {
                    setImageLoaded(true);
                }
            })
            .catch((err) => {
                setImageError(err.message || "Failed to load image");
            });
    }, [image?.imageURL]);

    const handleImageClick = (e) => {
        e.preventDefault();
        trackEvent({
            action: "click_image",
            category: "feed",
        });
        window.open(image["imageURL"], "_blank");
    };

    // Show error if present
    if (imageError) {
        return (
            <ImageContainer>
                <Alert severity="error" sx={{ maxWidth: "600px", width: "100%" }}>
                    <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                        Image Generation Error
                    </Typography>
                    <Typography variant="body2">{imageError}</Typography>
                </Alert>
            </ImageContainer>
        );
    }

    const ImageContent = (
        <PromptTooltip title={image["prompt"]} seed={image["seed"]}>
            <ImageStyle
                src={image["imageURL"]}
                alt="generative_image"
                onClick={handleImageClick}
                onError={() => setImageError("Failed to load image")}
            />
        </PromptTooltip>
    );

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
            {image
                ? isDesktop
                    ? <Link
                          href={image["imageURL"]}
                          target="_blank"
                          rel="noopener"
                          onClick={handleImageClick}
                      >
                          {ImageContent}
                      </Link>
                    : ImageContent
                : <Typography
                      component="div"
                      variant="h6"
                      color="textSecondary"
                  >
                      Loading image...
                  </Typography>}
        </ImageContainer>
    );
});

const ImageStyle = styled.img`
  height: 600px;
  width: 100%;
  max-width: 100%;
  object-fit: contain;

  ${({ theme }) => theme.breakpoints.down("md")} {
    height: 400px;
  }
`;
const ImageContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 1.5em;
`;

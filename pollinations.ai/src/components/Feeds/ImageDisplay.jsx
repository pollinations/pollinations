import React, { memo } from "react";
import { Typography, Link, useMediaQuery, useTheme } from "@mui/material";
import PromptTooltip from "../PromptTooltip";
import styled from "@emotion/styled";
import { trackEvent } from "../../config/analytics.js";
import { ErrorHandlingImage } from "../ErrorHandlingImage";

/**
 * ImageDisplay
 * Displays an image with a tooltip and tracks click events.
 * Tracks user interactions when the image is clicked.
 */
export const ImageDisplay = memo(function ImageDisplay({ image }) {
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
    const handleImageClick = (e) => {
        e.preventDefault();
        trackEvent({
            action: "click_image",
            category: "feed",
        });
        window.open(image["imageURL"], "_blank");
    };

    const ImageContent = (
        <PromptTooltip title={image["prompt"]} seed={image["seed"]}>
            <ErrorHandlingImage
                src={image["imageURL"]}
                alt="generative_image"
                onClick={handleImageClick}
                style={{
                    height: isDesktop ? "600px" : "400px",
                    width: "100%",
                    maxWidth: "100%",
                    objectFit: "contain",
                }}
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

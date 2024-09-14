import React from "react"
import { Box, Typography } from "@material-ui/core"
import { ImageContainer, ImageStyle } from "../ImageHeading"
import { ModelInfo } from "./ModelInfo"

export function ImageDisplay({ image, isMobile, handleCopyLink }) {
  return (
    <ImageContainer
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
      }}
    >
      {image ? (
        <>
          <Box>
            <Box position="relative">
              <ImageStyle src={image["imageURL"]} alt="generative_image" />
            </Box>
          </Box>
          {!isMobile && (
            <>
              <Box display="flex" alignItems="center">
                <ModelInfo
                  model={image["model"]}
                  wasPimped={image["wasPimped"]}
                  referrer={image["referrer"]}
                />
              </Box>
            </>
          )}
        </>
      ) : (
        <Typography variant="h6" color="textSecondary">
          Loading image...
        </Typography>
      )}
    </ImageContainer>
  )
}

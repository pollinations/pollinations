import React from "react"
import { Box, Typography, Tooltip, IconButton } from "@material-ui/core"
import FileCopyIcon from "@material-ui/icons/FileCopy"
import { ImageContainer, ImageStyle } from "../styles"
import { Colors } from "../../../styles/global"
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
              <Tooltip title="Copy link">
                <IconButton
                  onClick={handleCopyLink}
                  style={{ color: Colors.lime, position: "absolute", top: 0, right: 0 }}
                >
                  <FileCopyIcon />
                </IconButton>
              </Tooltip>
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

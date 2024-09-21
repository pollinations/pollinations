import React from "react"
import { Typography } from "@material-ui/core"
import { ImageContainer, ImageStyle } from "../ImageHeading"

export function ImageDisplay({ image }) {
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
                <ImageStyle src={image["imageURL"]} alt="generative_image" />
            ) : (
                <Typography variant="h6" color="textSecondary">
                    Loading image...
                </Typography>
            )}
        </ImageContainer>
    )
}
import React from "react"
import { Typography } from "@material-ui/core"
import { ImageContainer } from "../ImageHeading"
import PromptTooltip from "../../../components/PromptTooltip"

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
                <a href={image["imageURL"]} target="_blank" rel="noopener">
                    <PromptTooltip title={image["prompt"]} seed={image["seed"]}>
                        <ImageStyle src={image["imageURL"]} alt="generative_image" />
                    </PromptTooltip>
                </a>
            ) : (
                <Typography variant="h6" color="textSecondary">
                    Loading image...
                </Typography>
            )}
        </ImageContainer>
    )
}


export const ImageStyle = styled.img`
  height: 600px;
  max-width: 100%;
  object-fit: contain;
`

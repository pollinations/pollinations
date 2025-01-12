import React, { memo } from "react"
import { Typography } from "@mui/material"
import { ImageContainer } from "../ImageHeading"
import PromptTooltip from "../PromptTooltip"
import styled from '@emotion/styled';
import useIsMobile from "../../hooks/useIsMobile";


export const ImageDisplay = memo(function ImageDisplay({ image }) {
    const isMobile = useIsMobile();
    return (
        <ImageContainer
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                position: "relative",
                boxShadow: "none"
            }}
        >
            {image ? (
                isMobile ? (
                    <PromptTooltip title={image["prompt"]} seed={image["seed"]}>
                        <ImageStyle src={image["imageURL"]} alt="generative_image" />
                    </PromptTooltip>
                ) : (
                    <a href={image["imageURL"]} target="_blank" rel="noopener">
                        <PromptTooltip title={image["prompt"]} seed={image["seed"]}>
                            <ImageStyle src={image["imageURL"]} alt="generative_image" />
                        </PromptTooltip>
                    </a>
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

import React, { memo } from "react"
import { Typography, Link, Box, useMediaQuery, useTheme } from "@mui/material"
import { ImageContainer } from "../ImageHeading"
import PromptTooltip from "../PromptTooltip"
import styled from '@emotion/styled';
import { Colors } from "../../config/global"
export const ImageDisplay = memo(function ImageDisplay({ image }) {
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

    const ImageContent = (
        <PromptTooltip title={image["prompt"]} seed={image["seed"]}>
            <ImageStyle src={image["imageURL"]} alt="generative_image" />
        </PromptTooltip>
    );

    return (
        <ImageContainer
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                position: "relative",
                boxShadow: "none",
                backgroundColor: Colors.offblack2
            }}
        >
            {image ? (
                isDesktop ? (
                    <Link href={image["imageURL"]} target="_blank" rel="noopener">
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

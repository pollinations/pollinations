import React, { memo } from "react"
import { Typography, Link, Box } from "@mui/material"
import { ImageContainer } from "../ImageHeading"
import PromptTooltip from "../PromptTooltip"
import styled from '@emotion/styled';

export const ImageDisplay = memo(function ImageDisplay({ image }) {
    return (
        <ImageContainer
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                position: "relative",
                boxShadow: "none"
            }}
        >
            {image ? (
                <>
                    {/* Mobile View */}
                    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                        <PromptTooltip title={image["prompt"]} seed={image["seed"]}>
                            <ImageStyle src={image["imageURL"]} alt="generative_image" />
                        </PromptTooltip>
                    </Box>
                    {/* Desktop View */}
                    <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                        <Link href={image["imageURL"]} target="_blank" rel="noopener">
                            <PromptTooltip title={image["prompt"]} seed={image["seed"]}>
                                <ImageStyle src={image["imageURL"]} alt="generative_image" />
                            </PromptTooltip>
                        </Link>
                    </Box>
                </>
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

import React from 'react';
import { Link, Box, Typography, Tooltip, IconButton } from '@material-ui/core';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import { ImageContainer, ImageStyle } from '../styles';
import { Colors } from '../../../styles/global';
import { ModelInfo } from './ModelInfo';

export function ImageDisplay({ image, isMobile, handleCopyLink }) {
    return (
        <ImageContainer style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {image ? (
                <>
                    <Link href={image["imageURL"]} target="_blank" rel="noopener noreferrer">
                        <Box maxWidth="90%">
                            <ImageStyle src={image["imageURL"]} alt="generative_image" />
                        </Box>
                    </Link>
                    {!isMobile && (
                        <Box display="flex" alignItems="center">
                            <ModelInfo model={image["model"]} />
                            &nbsp;&nbsp;
                            <Tooltip title="Copy link">
                                <IconButton onClick={handleCopyLink} style={{ color: Colors.lime }}>
                                    <FileCopyIcon />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    )}
                </>
            ) : (
                <Typography variant="h6" color="textSecondary">Loading image...</Typography>
            )}
        </ImageContainer>
    );
}
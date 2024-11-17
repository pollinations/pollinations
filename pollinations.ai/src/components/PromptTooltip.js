import React from 'react';
import { withStyles, Tooltip, Typography, Box } from '@material-ui/core';

const StyledTooltip = withStyles({
    tooltip: {
        fontSize: '0.75em', // Reduced font size
        backgroundColor: 'rgba(10, 10, 0, 0.8)', // Lighter background with more transparency
        color: 'rgba(255, 232, 1, 0.8)',
        transition: 'opacity 1.0s ease-in-out', // Smooth transition
        border: '1px solid rgba(255, 232, 1, 0.8)', // Thin yellow border
    },
    arrow: {
        color: 'rgba(255, 232, 1, 0.8)',
    },
})(Tooltip);

const PromptTooltip = ({ title, children, seed = null }) => {
    return (
        <StyledTooltip
            key={title}
            title={
                <Box>
                    <Typography
                        variant="body2"
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 3, // Reduced line clamp for conciseness
                            maxHeight: '4.5em', // Adjusted max height
                            lineHeight: '1.5em',
                        }}
                    >
                        <strong>Prompt:</strong> {title}
                    </Typography>
                    {seed !== null && (
                        <Typography variant="caption" style={{ fontStyle: 'italic', marginTop: '0.3em' }}>
                            <strong>Seed:</strong> {seed}
                        </Typography>
                    )}
                </Box>
            }
            arrow
            placement="top"
            enterDelay={2250}
            enterNextDelay={1500}
            leaveDelay={200} // Delay before hiding tooltip
        >
            <Box component="span" style={{ margin: '0px', padding: '0px' }}>
                {children}
            </Box>
        </StyledTooltip>
    );
};

export default PromptTooltip;
import React from 'react';
import { withStyles, Tooltip, Typography, Box } from '@material-ui/core';
import LabelIcon from '@material-ui/icons/Label'; // Import an icon for the seed label

const StyledTooltip = withStyles({
    tooltip: {
        fontSize: '1em',
        backgroundColor: '#333',
        color: '#fff',
    },
    popper: {
        transitionDelay: '500ms',
    },
})(Tooltip);

const PromptTooltip = ({ title, children, seed = null }) => {
    return (
        <StyledTooltip
            title={
                <Box>
                    <Typography
                        variant="body2"
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 4,
                            maxHeight: '6em',
                            lineHeight: '1.5em',
                        }}
                    >
                        {title}
                    </Typography>
                    {seed !== null ? (
                        <Box display="flex" alignItems="center" style={{ marginTop: '0.5em' }}>
                            <Typography variant="caption" style={{ fontWeight: 'bold', marginRight: '0.5em' }}>
                                Seed:
                            </Typography>
                            <Typography variant="caption" style={{ fontStyle: 'italic' }}>
                                {seed}
                            </Typography>
                        </Box>
                    ) : null}
                </Box>
            }
            arrow
            placement="top"
        >
            <Box component="span" style={{ margin: '0px', padding: '0px' }}>
                {children}
            </Box>
        </StyledTooltip>
    );
};

export default PromptTooltip;
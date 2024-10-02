import React from 'react';
import { withStyles, Tooltip, Typography, Box } from '@material-ui/core';

const StyledTooltip = withStyles({
    tooltip: {
        fontSize: '0.8em',
        backgroundColor: 'rgba(51, 51, 51, 0.7)',
        color: '#fff',
        padding: '4px 8px',
        maxWidth: '200px',
    },
    popper: {
        transitionDelay: '1000ms',
    },
})(Tooltip);

const PromptTooltip = ({ title, children, seed = null }) => {
    return (
        <StyledTooltip
            title={
                <Box>
                    <Typography variant="caption">
                        {title}
                    </Typography>
                    {seed !== null && (
                        <Typography variant="caption" style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                            Seed: {seed}
                        </Typography>
                    )}
                </Box>
            }
            placement="top"
            enterDelay={500}
            leaveDelay={200}
        >
            {children}
        </StyledTooltip>
    );
};

export default PromptTooltip;
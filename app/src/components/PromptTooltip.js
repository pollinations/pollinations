import React from 'react';
import { withStyles, Tooltip } from '@material-ui/core';

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

const PromptTooltip = ({ title, children }) => {
    // Add console log to debug
    console.log("PromptTooltip received title:", title);

    return (
        <StyledTooltip
            title={
                <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 3,
                    maxHeight: '45em',
                    lineHeight: '1.5em',
                }}>
                    {title}
                </span>
            }
            arrow
            enterDelay={200}
            leaveDelay={200}
            placement="top"
        >
            {children}
        </StyledTooltip>
    );
};

export default PromptTooltip;
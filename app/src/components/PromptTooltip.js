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
    return (
        <StyledTooltip
            title={
                <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 4,
                    maxHeight: '60em',
                    lineHeight: '1.5em',
                }}>
                    {title}
                </span>
            }
            arrow
            placement="top"
        >
            <span style={{ margin: '0px', padding: '0px' }}>
                {children}
            </span>
        </StyledTooltip>
    );
};

export default PromptTooltip;
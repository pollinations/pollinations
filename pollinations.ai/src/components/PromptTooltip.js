import React from "react";
import { Tooltip, Typography, Box } from "@mui/material";
import { withStyles } from "@mui/styles";
import { SHOW_PROMPT_TOOLTIP } from "../config/global";

import { Colors } from "../config/global";

const StyledTooltip = withStyles({
    tooltip: {
        fontSize: "0.75em",
        backgroundColor: Colors.offblack,
        color: Colors.lime,
        transition: "opacity 1.0s ease-in-out",
        border: `1px solid ${Colors.lime}`,
    },
    arrow: {
        color: Colors.lime,
    },
})(Tooltip);

const PromptTooltip = ({ title, children, seed = null }) => {
    if (!SHOW_PROMPT_TOOLTIP) {
        // If the flag is false, render children without the tooltip
        return <>{children}</>;
    }
    return (
        <StyledTooltip
            key={title}
            title={
                <Box>
                    <Typography
                        variant="body2"
                        component="div"
                        style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 3, // Reduced line clamp for conciseness
                            maxHeight: "4.5em", // Adjusted max height
                            lineHeight: "1.5em",
                        }}
                    >
                        <strong>Prompt:</strong> {title}
                    </Typography>
                    {seed !== null && (
                        <Typography
                            component="div"
                            variant="caption"
                            style={{ fontStyle: "italic", marginTop: "0.3em" }}
                        >
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
            <Box component="span" style={{ margin: "0px", padding: "0px" }}>
                {children}
            </Box>
        </StyledTooltip>
    );
};

export default PromptTooltip;

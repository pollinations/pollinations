import React from "react";
import { Tooltip } from "@mui/material";

export const CustomTooltip = React.forwardRef(function CustomTooltip(
    { children, ...props },
    ref,
) {
    // Clone the child element and attach a ref so Tooltip can track focus, etc.
    return (
        <Tooltip {...props}>{React.cloneElement(children, { ref })}</Tooltip>
    );
});

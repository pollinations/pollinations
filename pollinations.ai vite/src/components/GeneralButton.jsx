import React from "react";
import { Button } from "@mui/material";
import { Colors } from "../config/global";

// ForwardRef component that directly uses the MUI <Button>
export const GeneralButton = React.forwardRef(function GeneralButton(
    {
        handleClick,
        isLoading,
        borderColor,
        backgroundColor,
        textColor,
        fontSize,
        height,
        minHeight,
        style,
        children,
        isInputChanged,
        borderRadius,
        ...rest
    },
    ref,
) {
    // Merge style props with inline styling
    const mergedStyle = {
        border: borderColor ? `3px solid ${borderColor}` : "none",
        backgroundColor: backgroundColor || "transparent",
        color: textColor || borderColor || "transparent",
        fontSize: fontSize || "1.5em",
        fontWeight: "normal",
        height: height || "auto",
        minHeight: height || "60px",
        borderRadius: borderRadius || "0px",
        padding: "0px 1em",
        transition: "all 0.6s ease",
        opacity: isLoading ? 0.7 : 1,
        position: "relative",
        "&:hover": {
            backgroundColor: backgroundColor
                ? `${backgroundColor}B3`
                : "transparent", // 70% opacity
            borderColor: borderColor ? `${borderColor}B3` : "none", // 70% opacity
            filter: "brightness(105%)",
        },
        "&::after": isLoading
            ? {
                  content: '""',
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  height: "2px",
                  backgroundColor: textColor || borderColor || "transparent",
                  animation: "loadingProgress 1.5s infinite ease-in-out",
                  width: "100%",
              }
            : {},
        "@keyframes loadingProgress": {
            "0%": { width: "0%", left: "0%" },
            "50%": { width: "100%", left: "0%" },
            "100%": { width: "0%", left: "100%" },
        },
        ...style,
    };

    return (
        <Button
            ref={ref}
            onClick={handleClick}
            disabled={isLoading}
            sx={mergedStyle}
            {...rest}
        >
            {children}
        </Button>
    );
});

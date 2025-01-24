import React from "react"
import { Button } from "@mui/material"

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
    ...rest
  },
  ref
) {
  // Merge style props with inline styling
  const mergedStyle = {
    border: borderColor ? `1px solid ${borderColor}` : "none",
    backgroundColor: backgroundColor || "transparent",
    color: textColor || borderColor || "transparent",
    fontSize: fontSize || "1.5em",
    height: height || "auto",
    minHeight: height || "60px",
    borderRadius: "0px",
    padding: "0px 1em",
    transition: "background-color 0.3s, border-color 0.3s",
    "&:hover": {
      backgroundColor: backgroundColor ? `${backgroundColor}B3` : "transparent", // 70% opacity
      borderColor: borderColor ? `${borderColor}B3` : "none", // 70% opacity
    },
    ...style,
  }

  return (
    <Button ref={ref} onClick={handleClick} disabled={isLoading} sx={mergedStyle} {...rest}>
      {children}
    </Button>
  )
})

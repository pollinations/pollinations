import React from "react"
import { Box, Checkbox, Typography } from "@mui/material"
import { Colors, Fonts } from "../../config/global"
import { CustomTooltip } from "../CustomTooltip"
import { LLMTextManipulator } from "../LLMTextManipulator"
import { emojify, rephrase, noLink } from "../../config/llmTransforms"
import CheckIcon from "@mui/icons-material/Check"
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank"
import { trackEvent } from "../../config/analytics"

/**
 * Reusable component for checkbox parameter inputs with consistent styling
 * 
 * @param {Object} props
 * @param {string} props.label - Checkbox label
 * @param {boolean} props.checked - Current checkbox value
 * @param {Function} props.onChange - Handler for value changes
 * @param {Function} props.onFocus - Handler for focus events
 * @param {string} props.tooltipText - Text to display in tooltip
 * @param {string} props.paramName - Parameter name for tracking
 * @param {Function} props.setIsInputChanged - Function to set input changed state
 * @param {string} props.category - Category for analytics tracking
 * @param {Object} props.styles - Custom styling properties
 */
export function ParameterCheckbox({
  label,
  checked,
  onChange,
  onFocus,
  tooltipText,
  paramName,
  setIsInputChanged,
  category = "feed",
  styles = {}
}) {
  // Default styling constants
  const defaultStyles = {
    backgroundColor: "transparent",
    borderColor: Colors.gray2,
    borderColorHover: Colors.lime,
    labelColor: `${Colors.offwhite}99`,
    checkboxColorOn: Colors.offwhite,
    checkboxColorOff: Colors.offblack
  }
  
  // Merge default styles with custom styles
  const mergedStyles = { ...defaultStyles, ...styles }
  
  const typographyStyles = {
    label: {
      color: mergedStyles.labelColor,
      fontSize: "1em",
      fontFamily: Fonts.parameter,
      textAlign: "center",
      width: "100%"
    },
  }

  const handleChange = (e) => {
    const newValue = e.target.checked
    onChange(newValue)
    
    if (typeof trackEvent === "function") {
      trackEvent({
        action: `change_${paramName}`,
        category,
        value: newValue,
      })
    }
  }

  return (
    <>
      <CustomTooltip
        title={
          <LLMTextManipulator
            text={tooltipText}
            transforms={[rephrase, emojify, noLink]}
          />
        }
        interactive
      >
        <Typography component="div" variant="body" sx={typographyStyles.label}>
          {label}
        </Typography>
      </CustomTooltip>
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "60px",
          width: "100%",
          backgroundColor: mergedStyles.backgroundColor,
          transition: "border-color 0.2s ease",
          border: `1px solid ${mergedStyles.borderColor}`,
          "&:hover": {
            borderColor: mergedStyles.borderColorHover,
          }
        }}
      >
        <Checkbox
          checked={checked}
          onChange={handleChange}
          onFocus={onFocus}
          disableRipple={true}
          icon={
            <CheckBoxOutlineBlankIcon
              sx={{
                color: mergedStyles.checkboxColorOff,
                fontSize: "1.8em",
                padding: "2px"
              }}
            />
          }
          checkedIcon={
            <CheckIcon
              sx={{
                color: mergedStyles.checkboxColorOn,
                fontSize: "1.8em",
                padding: "2px"
              }}
            />
          }
        />
      </Box>
    </>
  )
} 
import React from "react";
import { Box, TextField, Typography } from "@mui/material";
import { Colors, Fonts } from "../../config/global";
import { CustomTooltip } from "../CustomTooltip";
import { LLMTextManipulator } from "../LLMTextManipulator";
import { emojify, rephrase, noLink } from "../../config/llmTransforms";
import { trackEvent } from "../../config/analytics";

/**
 * Reusable component for number parameter inputs with consistent styling
 *
 * @param {Object} props
 * @param {string} props.label - Input label
 * @param {string|number} props.value - Current input value
 * @param {Function} props.onChange - Handler for value changes
 * @param {Function} props.onFocus - Handler for focus events
 * @param {string} props.tooltipText - Text to display in tooltip
 * @param {string} props.paramName - Parameter name for tracking
 * @param {Function} props.setIsInputChanged - Function to set input changed state
 * @param {string} props.category - Category for analytics tracking
 * @param {Object} props.styles - Custom styling properties
 */
export function ParameterNumberInput({
    label,
    value,
    onChange,
    onFocus,
    tooltipText,
    paramName,
    setIsInputChanged,
    category = "feed",
    styles = {},
}) {
    // Default styling constants
    const defaultStyles = {
        backgroundColor: Colors.offblack,
        textColor: Colors.offwhite,
        labelColor: Colors.offwhite,
    };

    // Merge default styles with custom styles
    const mergedStyles = { ...defaultStyles, ...styles };

    const paramTextSize = { xs: "1.5em", md: "1.1em" };

    const typographyStyles = {
        label: {
            color: mergedStyles.labelColor,
            fontSize: "0.9em",
            fontFamily: Fonts.parameter,
        },
    };

    const handleChange = (e) => {
        onChange(e.target.value);
    };

    const handleBlur = (e) => {
        const parsed = parseInt(e.target.value, 10);
        if (typeof trackEvent === "function") {
            trackEvent({
                action: `change_${paramName}`,
                category,
                value: isNaN(parsed) ? undefined : parsed,
            });
        }
    };

    // Ensure value is always a valid controlled input value
    const safeValue = value !== undefined && value !== null ? value : "";

    return (
        <>
            {tooltipText
                ? <CustomTooltip
                      title={
                          <LLMTextManipulator
                              text={tooltipText}
                              transforms={[rephrase, emojify, noLink]}
                          />
                      }
                      interactive
                  >
                      <Typography
                          component="div"
                          variant="body"
                          sx={typographyStyles.label}
                      >
                          {label}
                      </Typography>
                  </CustomTooltip>
                : <Typography
                      component="div"
                      variant="body"
                      sx={typographyStyles.label}
                  >
                      {label}
                  </Typography>}
            <Box
                sx={{
                    height: "60px",
                    backgroundColor: Colors.offblack2,
                }}
            >
                <TextField
                    variant="outlined"
                    value={safeValue}
                    onChange={handleChange}
                    onFocus={onFocus}
                    onBlur={handleBlur}
                    type="number"
                    InputProps={{
                        sx: {
                            fontSize: paramTextSize,
                            fontFamily: Fonts.parameter,
                            height: "60px",
                            "& .MuiOutlinedInput-notchedOutline": {
                                border: "none",
                            },
                            "& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                                {
                                    WebkitAppearance: "none",
                                    margin: 0,
                                },
                            "& input[type=number]": {
                                MozAppearance: "textfield",
                            },
                        },
                    }}
                    sx={{ width: "100%" }}
                />
            </Box>
        </>
    );
}

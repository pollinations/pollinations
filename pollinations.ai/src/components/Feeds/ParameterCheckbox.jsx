import React from "react";
import { Box, Checkbox, Typography } from "@mui/material";
import { Colors, Fonts } from "../../config/global";
import { CustomTooltip } from "../CustomTooltip";
import { LLMTextManipulator } from "../LLMTextManipulator";
import { emojify, rephrase, noLink } from "../../config/llmTransforms";
import CheckIcon from "@mui/icons-material/Check";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import { trackEvent } from "../../config/analytics.js";

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
    category = "feed",
}) {
    // Default styling constants
    const defaultStyles = {
        backgroundColor: Colors.offblack2,
        borderColorHover: Colors.lime,
        labelColor: Colors.gray2,
        checkboxColorOn: Colors.offwhite,
        checkboxColorOff: Colors.offwhite,
    };

    const typographyStyles = {
        label: {
            color: defaultStyles.labelColor,
            fontSize: "0.9em",
            fontFamily: Fonts.parameter,
            textAlign: "left",
            width: "100%",
        },
    };

    const handleChange = (e) => {
        const newValue = e.target.checked;
        onChange(newValue);

        if (typeof trackEvent === "function") {
            trackEvent({
                action: `change_${paramName}`,
                category,
                value: newValue,
            });
        }
    };

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
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "60px",
                    width: "100%",
                    backgroundColor: defaultStyles.backgroundColor,
                    transition: "border-color 0.2s ease",
                    border: `0px solid ${defaultStyles.borderColor}`,
                    borderRadius: "0em",
                    "&:hover": {
                        borderColor: defaultStyles.borderColorHover,
                    },
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
                                color: defaultStyles.checkboxColorOff,
                                fontSize: "1.8em",
                                padding: "2px",
                            }}
                        />
                    }
                    checkedIcon={
                        <CheckIcon
                            sx={{
                                color: defaultStyles.checkboxColorOn,
                                fontSize: "1.8em",
                                padding: "2px",
                            }}
                        />
                    }
                />
            </Box>
        </>
    );
}

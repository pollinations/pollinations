import React, { useState, useEffect, memo } from "react"
import {
  Box,
  Paper,
  Typography,
  Menu,
  MenuItem,
  TextField,
  Checkbox,
  Button,
} from "@mui/material"
import TextareaAutosize from 'react-textarea-autosize'
import { Colors, Fonts } from "../../config/global"
import { CustomTooltip } from "../CustomTooltip"
import { GeneralButton } from "../GeneralButton"
import Grid from "@mui/material/Grid2"
import { FEED_ENANCER_TOOLTIP, FEED_LOGO_WATERMARK, IMAGE_EDIT_BUTTON_OFF } from "../../config/copywrite"
import ReactMarkdown from "react-markdown"
import { keyframes } from "@emotion/react"
import CheckIcon from "@mui/icons-material/Check"
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank"
import { LLMTextManipulator } from "../../components/LLMTextManipulator"

export const ImageEditor = memo(function ImageEditor({
  image,
  handleParamChange,
  handleFocus,
  isLoading,
  setIsInputChanged,
  handleButtonClick,
  isInputChanged,
  imageParams,
  isStopped,
  stop,
  toggleValue,
}) {
  // Styling Constants
  const labelColor = Colors.gray2
  const labelFont = Fonts.parameter
  const labelSize = "1em"
  const paramTextColor = Colors.offwhite
  const paramTextSize = { xs: "1.5em", md: "1.1em" }
  const paramBorderColor = Colors.gray2
  const checkboxColorOn = Colors.lime
  const checkboxColorOff = Colors.offblack

  // Local state
  const [anchorEl, setAnchorEl] = useState(null)

  // If needed, close menu or reset local state when the image changes
  useEffect(() => {
    setAnchorEl(null)
  }, [image])

  if (!imageParams?.imageURL) {
    return (
      <Typography component="div" variant="body" style={{ color: Colors.offwhite }}>
        Loading...
      </Typography>
    )
  }

  const { width, height, seed, enhance = false, nologo = false, model } = imageParams

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = (value) => {
    setAnchorEl(null)
    if (value) {
      handleInputChange("model", value)
    }
  }

  const handleInputChange = (param, value) => {
    let newValue

    if (param === "model") {
      newValue = value
    } else if (param === "enhance" || param === "nologo") {
      // Force the value for CheckBox to be a boolean
      newValue = Boolean(value)
    } else {
      const parsedValue = parseInt(value, 10)
      newValue = isNaN(parsedValue) ? "" : parsedValue
    }

    if (imageParams[param] !== newValue) {
      setIsInputChanged(true)
    }
    handleParamChange(param, newValue)
  }

  const isEnhanceChecked = enhance
  const isLogoChecked = !nologo

  // Extracted Styles
  const typographyStyles = {
    label: {
      color: labelColor,
      fontSize: labelSize,
      fontFamily: labelFont,
    },
  }

  const buttonStyles = {
    base: {
      color: Colors.offwhite,
      width: "100%",
      justifyContent: "flex-start",
      height: "56px",
      border: `solid 0.5px ${paramBorderColor}`,
    },
    responsiveFontSize: {
      fontSize: paramTextSize,
    },
  }

  const menuItemHover = {
    "&:hover": {
      backgroundColor: Colors.offwhite,
      color: checkboxColorOff,
    },
  }

  const blinkAnimation = keyframes`
        0%, 100% { background-color: ${Colors.offblack}; color: ${Colors.lime}; }
        50% { background-color: ${Colors.lime}; color: ${Colors.offblack}; }
      `

  const models = [
    "flux",
    "flux-pro",
    "flux-realism",
    "flux-anime",
    "flux-3d",
    "flux-cablyai",
    "turbo",
  ]

  const sharedTextAreaStyle = {
    width: "100%",
    backgroundColor: "transparent",
    border: `0.1px solid ${paramBorderColor}`,
    fontFamily: Fonts.parameter,
    fontSize: paramTextSize,
    color: paramTextColor,
    padding: "15px",
    height: "120px",
    minHeight: "30px",
    resize: "vertical",
    overflowY: "auto",
    scrollbarWidth: "auto",
    scrollbarColor: `${Colors.gray2}99 transparent`,
    msOverflowStyle: "auto",
    transition: 'all 0.2s ease',
    '&:focus': {
      outline: 'none',
      borderColor: Colors.lime,
      boxShadow: `0 0 0 2px ${Colors.lime}33`
    },
    '&::placeholder': {
      color: Colors.gray2,
      opacity: 1
    }
  }

  return (
    <Box
      component={Paper}
      sx={{
        border: "none",
        boxShadow: "none",
        backgroundColor: "transparent",
      }}
    >
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 12 }}>
          <Box>
            <Typography component="div" variant="body" sx={typographyStyles.label}>
              Prompt
            </Typography>
            <Box>
              {isStopped ? (
                // Edit mode: Text area (no Markdown)
                <TextareaAutosize
                  value={imageParams.prompt}
                  onChange={(e) => handleParamChange("prompt", e.target.value)}
                  onFocus={handleFocus}
                  minRows={3}
                  maxRows={6}
                  cacheMeasurements
                  onHeightChange={(height) => console.log('New height:', height)}
                  style={{
                    fontFamily: Fonts.parameter,
                    fontSize: "1.1em",
                    color: paramTextColor,
                    padding: "15px",
                    resize: "vertical",
                    overflowY: "auto",
                    scrollbarWidth: "auto",
                    scrollbarColor: `${Colors.gray2}99 transparent`,
                    msOverflowStyle: "auto",
                    backgroundColor: "transparent",
                    border: `0.1px solid ${paramBorderColor}`,
                    width: "100%",
                  }}
                />
              ) : (
                // Read-only mode with Markdown
                <Box style={sharedTextAreaStyle}>
                  <ReactMarkdown
                    components={{
                      // override <p> styling
                      p: ({ node, ...props }) => (
                        <p
                          style={{
                            margin: 0,
                            fontFamily: Fonts.parameter,
                            fontSize: paramTextSize.md, // or paramTextSize.xs if you prefer
                            color: Colors.offwhite,
                          }}
                          {...props}
                        />
                      ),
                    }}
                  >
                    {imageParams.prompt}
                  </ReactMarkdown>
                </Box>
              )}
            </Box>
          </Box>
        </Grid>
        {toggleValue === "edit" && (
          <>
            <Grid size={{ xs: 12, sm: 4, md: 2 }}>
              <Typography component="div" variant="body" sx={typographyStyles.label}>
                Model
              </Typography>
              <Button
                variant="outlined"
                aria-controls="model-menu"
                aria-haspopup="true"
                onClick={handleMenuOpen}
                onFocus={handleFocus}
                sx={{
                  ...buttonStyles.base,
                  ...buttonStyles.responsiveFontSize,
                  borderRadius: "0px",
                  height: "60px",
                  fontFamily: Fonts.parameter,
                  fontSize: paramTextSize,
                }}
              >
                {model || "flux"}
              </Button>
              <Menu
                id="model-menu"
                anchorEl={anchorEl}
                keepMounted
                open={Boolean(anchorEl)}
                onClose={() => handleMenuClose(null)}
                MenuListProps={{
                  sx: {
                    textAlign: "left",
                    backgroundColor: Colors.offblack,
                    fontFamily: Fonts.parameter,
                  },
                }}
              >
                {models.map((modelName) => (
                  <MenuItem
                    key={modelName}
                    onClick={() => handleMenuClose(modelName)}
                    sx={{
                      color: paramTextColor,
                      backgroundColor: Colors.offblack,
                      ...menuItemHover,
                    }}
                  >
                    {modelName.charAt(0).toUpperCase() + modelName.slice(1)}
                  </MenuItem>
                ))}
              </Menu>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Typography component="div" variant="body" sx={typographyStyles.label}>
                Width
              </Typography>
              <TextField
                variant="outlined"
                value={width}
                onChange={(e) => handleInputChange("width", e.target.value)}
                onFocus={handleFocus}
                type="number"
                InputProps={{
                  sx: {
                    color: paramTextColor,
                    fontSize: paramTextSize,
                    fontFamily: Fonts.parameter,
                    borderRadius: "0px",
                    border: `solid 0.1px ${paramBorderColor}`,
                  },
                }}
                sx={{ width: "100%" }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Typography component="div" variant="body" sx={typographyStyles.label}>
                Height
              </Typography>
              <TextField
                variant="outlined"
                value={height}
                onChange={(e) => handleInputChange("height", e.target.value)}
                onFocus={handleFocus}
                type="number"
                InputProps={{
                  sx: {
                    color: paramTextColor,
                    fontSize: paramTextSize,
                    fontFamily: Fonts.parameter,
                    border: `solid 0.1px ${paramBorderColor}`,
                    borderRadius: "0px",
                  },
                }}
                sx={{ width: "100%" }}
              />
            </Grid>
            <Grid size={{ xs: 4, sm: 4, md: 2 }}>
              <Typography component="div" variant="body" sx={typographyStyles.label}>
                Seed
              </Typography>
              <TextField
                fullWidth
                variant="outlined"
                value={seed}
                onChange={(e) => handleInputChange("seed", e.target.value)}
                onFocus={handleFocus}
                type="number"
                InputProps={{
                  sx: {
                    color: paramTextColor,
                    fontSize: paramTextSize,
                    fontFamily: Fonts.parameter,
                    border: `solid 0.1px ${paramBorderColor}`,
                    borderRadius: "0px",
                    height: "60px",
                  },
                }}
              />
            </Grid>
            <Grid size={{ xs: 4, sm: 2, md: 1 }}>
              <CustomTooltip
                title={FEED_ENANCER_TOOLTIP}
                sx={typographyStyles.tooltipIcon}
              >
                <Typography component="div" variant="body" sx={typographyStyles.label}>
                  Enhance
                </Typography>
              </CustomTooltip>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "60px",
                  width: "100%",
                  border: `solid 0.1px ${paramBorderColor}`,
                }}
              >
                <Checkbox
                  checked={isEnhanceChecked}
                  onChange={(e) => handleInputChange("enhance", e.target.checked)}
                  onFocus={handleFocus}
                  icon={<CheckBoxOutlineBlankIcon sx={{ color: Colors.offwhite }} />}
                  checkedIcon={<CheckIcon sx={{ color: Colors.offwhite }} />}
                  sx={{
                    color: "transparent",
                    "&.Mui-checked": {
                      color: Colors.lime,
                    },
                  }}
                />
              </Box>
            </Grid>
            <Grid size={{ xs: 4, sm: 2, md: 1 }}>
              <CustomTooltip
                title={FEED_LOGO_WATERMARK}
                sx={typographyStyles.tooltipIcon}
              >
                <Typography component="div" variant="body" sx={typographyStyles.label}>
                  Logo
                </Typography>
              </CustomTooltip>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "60px",
                  width: "100%",
                  border: `solid 0.1px ${paramBorderColor}`,
                }}
              >
                <Checkbox
                  checked={isLogoChecked}
                  onChange={(e) => handleInputChange("nologo", !e.target.checked)}
                  onFocus={handleFocus}
                  icon={<CheckBoxOutlineBlankIcon sx={{ color: Colors.offwhite }} />}
                  checkedIcon={<CheckIcon sx={{ color: Colors.offwhite }} />}
                />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 4, md: 2 }} style={{ marginTop: "24px" }}>
              <GeneralButton
                handleClick={handleButtonClick}
                isLoading={isLoading}
                isInputChanged={isInputChanged}
                borderColor={Colors.lime}
                backgroundColor="transparent"
                textColor={Colors.lime}
                fontSize={paramTextSize}
                style={{
                  width: "100%",
                  animation: isLoading ? `${blinkAnimation} 2s infinite` : "none",
                  height: "60px",
                  fontFamily: Fonts.parameter,
                }}
              >
                <LLMTextManipulator>{IMAGE_EDIT_BUTTON_OFF}</LLMTextManipulator>
              </GeneralButton>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  )
})

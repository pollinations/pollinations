import React, { useState, useEffect, memo, useRef, useCallback } from "react"
import { Box, Paper, Typography, Menu, MenuItem, TextField, Checkbox, Button } from "@mui/material"
import TextareaAutosize from "react-textarea-autosize"
import { Colors, Fonts } from "../../config/global"
import { CustomTooltip } from "../CustomTooltip"
import { GeneralButton } from "../GeneralButton"
import Grid from "@mui/material/Grid2"
import {
  IMAGE_FEED_ENANCER_TOOLTIP,
  IMAGE_FEED_LOGO_WATERMARK,
  IMAGE_EDIT_BUTTON_OFF,
  IMAGE_FEED_TOOLTIP_PROMPT,
  IMAGE_FEED_TOOLTIP_MODEL,
  IMAGE_FEED_TOOLTIP_WIDTH,
  IMAGE_FEED_TOOLTIP_HEIGHT,
  IMAGE_FEED_TOOLTIP_SEED} from "../../config/copywrite"
import { emojify, rephrase, noLink } from "../../config/llmTransforms"
import ReactMarkdown from "react-markdown"
import { keyframes } from "@emotion/react"
import CheckIcon from "@mui/icons-material/Check"
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank"
import { LLMTextManipulator } from "../../components/LLMTextManipulator"
import { getImageURL } from "../../utils/getImageURL"
import { trackEvent } from "../../config/analytics"

/**
 * ImageEditor
 * A component used to manage image parameters such as model, width/height, seed, etc.
 * Accepts editing or read-only mode based on the `toggleValue` prop.
 */
export const ImageEditor = memo(function ImageEditor({
  image,
  handleFocus,
  isLoading,
  setIsInputChanged,
  isInputChanged,
  isStopped,
  toggleValue,
  stop,
  cancelLoading,
  updateImage,
  handleToggleChange,
}) {
  // ─── STYLING CONSTANTS ────────────────────────────────────────────────────────
  const labelColor = `${Colors.offwhite}99`
  const labelFont = Fonts.parameter
  const labelSize = "1em"
  const paramTextColor = Colors.offwhite
  const paramTextSize = { xs: "1.5em", md: "1.1em" }
  const paramBorderColor = Colors.gray2
  const checkboxColorOn = Colors.lime
  const checkboxColorOff = Colors.offblack

  // ─── LOCAL STATE ─────────────────────────────────────────────────────────────
  const [anchorEl, setAnchorEl] = useState(null)       // Anchor element for model dropdown menu
  const [imageParams, setImageParams] = useState({})   // Object holding current image parameters
  const imageParamsRef = useRef(imageParams)           // Reference to current state for use in callbacks
    
  // ─── EFFECTS ─────────────────────────────────────────────────────────────────
  // Close the model menu whenever the image updates
  useEffect(() => {
    setAnchorEl(null)
  }, [image])

  // Load image parameters into local state whenever `image` changes
  useEffect(() => {
    setImageParams(image)
  }, [image])

  // Update the ref whenever local imageParams changes
  useEffect(() => {
    imageParamsRef.current = imageParams
  }, [imageParams])

  // Destructuring parameters from imageParams
  const { width, height, seed, enhance = false, nologo = false, model } = imageParams

  // ─── HANDLERS: MENU ─────────────────────────────────────────────────────────
  /**
   * handleMenuOpen
   * Opens the model selection menu when triggered by a Button event.
   */
  const handleMenuOpen = (event) => {
    // Track event for opening the model menu
    if (typeof trackEvent === "function") {
      trackEvent({
        category: "ImageEditor",
        action: "Open Model Menu",
        label: "Open Model Selector",
      })
    }
    setAnchorEl(event.currentTarget)
  }

  /**
   * handleMenuClose
   * Closes the model menu. If `value` is provided, updates the selected model.
   */
  const handleMenuClose = (value) => {
    setAnchorEl(null)
    if (value) {
      // Track event for selecting a model
      if (typeof trackEvent === "function") {
        trackEvent({
          category: "ImageEditor",
          action: "Select Model",
          label: value,
        })
      }
      handleInputChange("model", value)
    }
  }

  // ─── HANDLERS: INPUT ────────────────────────────────────────────────────────
  /**
   * handleInputChange
   * Generic handler for textfield changes in width, height, and seed (numbers).
   * Also toggles booleans for "enhance" or "nologo."
   */
  const handleInputChange = (param, value) => {
    let newValue
    if (param === "model") {
      newValue = value
    } else if (param === "enhance" || param === "nologo") {
      // Force the value for checkbox to be a boolean
      newValue = Boolean(value)
    } else {
      const parsedValue = parseInt(value, 10)
      newValue = isNaN(parsedValue) ? "" : parsedValue
    }

    // Set "input changed" state if the new value differs from the old one
    if (imageParams[param] !== newValue) {
      setIsInputChanged(true)
    }
    handleParamChange(param, newValue)
  }

  // Flags for checkboxes
  const isEnhanceChecked = enhance
  const isLogoChecked = !nologo

  // Typography style overrides
  const typographyStyles = {
    label: {
      color: labelColor,
      fontSize: labelSize,
      fontFamily: labelFont,
    },
  }

  // ─── BUTTON CLICK ───────────────────────────────────────────────────────────
  /**
   * handleButtonClick
   * Cancels loading if the button is clicked while loading.
   * Increments seed if no changes were made and triggers handleSubmit.
   */
  const handleButtonClick = () => {
    if (isLoading) {
      cancelLoading()
      return
    }

    if (!isInputChanged) {
      // Track event for generating with bumped seed
      if (typeof trackEvent === "function") {
        trackEvent({
          category: "ImageEditor",
          action: "Generate with Bumped Seed",
          label: "Submit/Generate Button",
        })
      }
      // If no changes, bump seed for a new random value
      setImageParams((prevParams) => ({
        ...prevParams,
        seed: (prevParams.seed || 0) + 1,
      }))
    } else {
      // Track event for submitting generate
      if (typeof trackEvent === "function") {
        trackEvent({
          category: "ImageEditor",
          action: "Submit Generate",
          label: "Submit/Generate Button",
        })
      }
    }

    // Defer the submit call slightly to ensure state updates are captured
    setTimeout(handleSubmit, 250)
  }

  // ─── HANDLERS: PARAM UPDATE AND SUBMIT ─────────────────────────────────────
  /**
   * handleParamChange
   * Updates local imageParams state and triggers the `stop` function if the image
   * is not currently stopped (to allow editing).
   */
  const handleParamChange = useCallback(
    (param, value) => {
      setIsInputChanged(true)
      if (!isStopped) {
        stop(true)
      }
      setImageParams((prevParams) => ({
        ...prevParams,
        [param]: value,
      }))
    },
    [isStopped, stop, setIsInputChanged]
  )

  /**
   * handleSubmit
   * Builds updated image parameters into a URL and calls the provided
   * updateImage callback with the new parameters.
   */
  const handleSubmit = useCallback(() => {
    const currentImageParams = imageParamsRef.current
    const imageURL = getImageURL(currentImageParams)
    // console.log("Submitting with imageParams:", currentImageParams) // Commented out for production
    updateImage({
      ...currentImageParams,
      imageURL,
    })
  }, [updateImage])

  // ─── STYLES: BUTTONS, MENU, ANIMATIONS ─────────────────────────────────────
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

  // Menu items hover style
  const menuItemHover = {
    "&:hover": {
      backgroundColor: Colors.offwhite,
      color: checkboxColorOff,
    },
  }

  const blinkAnimation = keyframes`
    0% {
      background-color: ${Colors.offblack};
      color: ${Colors.lime};
    }
    50% {
      background-color: ${Colors.lime}B3;
      color: ${Colors.offblack}B3;
    }
    100% {
      background-color: ${Colors.offblack}B3;
      color: ${Colors.lime}B3;
    }
  `;
  


  // All available model options
  const models = [
    "flux",
    "flux-pro",
    "flux-realism",
    "flux-anime",
    "flux-3d",
    "flux-cablyai",
    "turbo",
  ]

  // Shared styles for read-only prompt box
  const sharedTextAreaStyle = {
    width: "100%",
    backgroundColor: `${Colors.offblack}99`,
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
    transition: "all 0.2s ease",
    "&:focus": {
      outline: "none",
      borderColor: Colors.lime,
      boxShadow: `0 0 0 2px ${Colors.lime}33`,
    },
    "&::placeholder": {
      color: Colors.gray2,
      opacity: 1,
    },
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────
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
        {/* Prompt Section */}
        <Grid size={{ xs: 12, md: 12 }}>
          <Box>
            <CustomTooltip
              title={<LLMTextManipulator text={IMAGE_FEED_TOOLTIP_PROMPT} transforms={[rephrase, emojify, noLink]} />}
              interactive
            >
              <Typography component="div" variant="body" sx={typographyStyles.label}>
                Prompt
              </Typography>
            </CustomTooltip>
            <Box>
              {isStopped ? (
                /* Edit mode: Text area (plaintext) */
                <TextareaAutosize
                  value={imageParams.prompt}
                  onChange={(e) => handleParamChange("prompt", e.target.value)}
                  onFocus={handleFocus}
                  minRows={3}
                  maxRows={6}
                  cacheMeasurements
                  onHeightChange={(height) => {
                    // Optionally track height changes
                  }}
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
                    backgroundColor: `${Colors.offblack}99`,
                    border: `0.1px solid ${paramBorderColor}`,
                    width: "100%",
                    lineHeight: "1.5em",
                  }}
                />
              ) : (
                /* Feed mode: Render Markdown */
                <Box
                  style={sharedTextAreaStyle}
                  onClick={() => {
                      handleToggleChange(null, "edit")
                    }}
                >
                  <ReactMarkdown
                    components={{
                      p: ({ node, ...props }) => (
                        <p
                          style={{
                            margin: 0,
                            fontFamily: Fonts.parameter,
                            fontSize: paramTextSize.md,
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

        {/* Conditional Rendering of Controls in Edit Mode */}
        {toggleValue === "edit" && (
          <>
            {/* Model Selector */}
            <Grid size={{ xs: 12, sm: 4, md: 2 }}>
              <CustomTooltip
                title={<LLMTextManipulator text={IMAGE_FEED_TOOLTIP_MODEL} transforms={[rephrase, emojify, noLink]} />}
                interactive
              >
                <Typography component="div" variant="body" sx={typographyStyles.label}>
                  Model
                </Typography>
              </CustomTooltip>
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
                  backgroundColor: `${Colors.offblack}99`,
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

            {/* Width Input */}
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <CustomTooltip
                title={<LLMTextManipulator text={IMAGE_FEED_TOOLTIP_WIDTH} transforms={[rephrase, emojify, noLink]} />}
                interactive
              >
                <Typography component="div" variant="body" sx={typographyStyles.label}>
                  Width
                </Typography>
              </CustomTooltip>
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
                    backgroundColor: `${Colors.offblack}99`,
                  },
                }}
                sx={{ width: "100%" }}
              />
            </Grid>

            {/* Height Input */}
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <CustomTooltip
                title={<LLMTextManipulator text={IMAGE_FEED_TOOLTIP_HEIGHT} transforms={[rephrase, emojify, noLink]} />}
                interactive
              >
                <Typography component="div" variant="body" sx={typographyStyles.label}>
                  Height
                </Typography>
              </CustomTooltip>
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
                    backgroundColor: `${Colors.offblack}99`,
                  },
                }}
                sx={{ width: "100%" }}
              />
            </Grid>

            {/* Seed Input */}
            <Grid size={{ xs: 4, sm: 4, md: 2 }}>
              <CustomTooltip
                title={<LLMTextManipulator text={IMAGE_FEED_TOOLTIP_SEED} transforms={[rephrase, emojify, noLink]} />}
                interactive
              >
                <Typography component="div" variant="body" sx={typographyStyles.label}>
                  Seed
                </Typography>
              </CustomTooltip>
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
                    backgroundColor: `${Colors.offblack}99`,
                  },
                }}
              />
            </Grid>

                {/* Enhance Checkbox */}
                <Grid size={{ xs: 4, sm: 2, md: 1 }}>
                  <CustomTooltip
                    title={<LLMTextManipulator text={IMAGE_FEED_ENANCER_TOOLTIP} transforms={[rephrase, emojify, noLink]} />}
                    interactive
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
                      backgroundColor: `${Colors.offblack}99`,
                    }}
                  >
                    <Checkbox
                      checked={isEnhanceChecked}
                      onChange={(e) => {
                        handleInputChange("enhance", e.target.checked);
                        if (typeof trackEvent === "function") {
                          trackEvent({
                            category: "ImageEditor",
                            action: "Toggle Enhance",
                            label: e.target.checked ? "Enable Enhance" : "Disable Enhance",
                          });
                        }
                      }}
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

                {/* Logo Checkbox */}
                <Grid size={{ xs: 4, sm: 2, md: 1 }}>
                  <CustomTooltip
                    title={<LLMTextManipulator text={IMAGE_FEED_LOGO_WATERMARK} transforms={[rephrase, emojify, noLink ]} />}
                    interactive
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
                      onChange={(e) => {
                        handleInputChange("nologo", !e.target.checked);
                        if (typeof trackEvent === "function") {
                          trackEvent({
                            category: "ImageEditor",
                            action: "Toggle Logo",
                            label: e.target.checked ? "Disable Logo" : "Enable Logo",
                          });
                        }
                      }}
                      onFocus={handleFocus}
                      icon={<CheckBoxOutlineBlankIcon sx={{ color: Colors.offwhite }} />}
                      checkedIcon={<CheckIcon sx={{ color: Colors.offwhite }} />}
                    />
                  </Box>
            </Grid>

            {/* Submit/Generate Button */}
            <Grid size={{ xs: 12, sm: 4, md: 2 }} style={{ marginTop: "24px" }}>
              <GeneralButton
                handleClick={handleButtonClick}
                isLoading={isLoading}
                isInputChanged={isInputChanged}
                borderColor={Colors.lime}
                backgroundColor={`${Colors.offblack}99`}
                textColor={Colors.lime}
                fontSize="1.5em"
                style={{
                  width: "100%",
                  animation: isLoading ? `${blinkAnimation} 2s ease-in-out infinite` : "none",
                  height: "60px",
                  fontFamily: Fonts.title,
                }}
              >
                <LLMTextManipulator text={IMAGE_EDIT_BUTTON_OFF} transforms={[noLink]} />
              </GeneralButton>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  )
})

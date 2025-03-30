import React, { useState, useEffect, memo, useRef, useCallback } from "react"
import { Box } from "@mui/material"
import { Colors, Fonts } from "../../config/global"
import { GeneralButton } from "../GeneralButton"
import Grid from "@mui/material/Grid2"
import { ModelSelector } from "./ModelSelector"
import { ParameterNumberInput } from "./ParameterNumberInput"
import { ParameterCheckbox } from "./ParameterCheckbox"
import {
  IMAGE_FEED_ENANCER_TOOLTIP,
  IMAGE_FEED_LOGO_WATERMARK,
  IMAGE_EDIT_BUTTON_OFF,
  IMAGE_FEED_TOOLTIP_MODEL,
  IMAGE_FEED_TOOLTIP_WIDTH,
  IMAGE_FEED_TOOLTIP_HEIGHT,
  IMAGE_FEED_TOOLTIP_SEED,
} from "../../config/copywrite"
import { noLink } from "../../config/llmTransforms"
import { keyframes } from "@emotion/react"
import { LLMTextManipulator } from "../LLMTextManipulator"
import { getImageURL } from "../../utils/getImageURL"
import { trackEvent } from "../../config/analytics"

// ─── PARAMETER STYLING CONSTANTS ────────────────────────────────────────────────
// These can be adjusted to control the appearance of all parameter inputs
const PARAM_STYLES = {
  backgroundColor: Colors.offblack2,
  textColor: Colors.offwhite,
  borderColor: Colors.gray2,
  borderColorHover: Colors.lime,
  labelColor: `${Colors.offwhite}99`,
  checkboxColorOn: Colors.offwhite,
  checkboxColorOff: Colors.offwhite,
}

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
  // ─── LOCAL STATE ─────────────────────────────────────────────────────────────
  // Initialize with default values for numeric inputs
  const [imageParams, setImageParams] = useState({
    width: 512,
    height: 512,
    seed: 0,
    enhance: false,
    nologo: false,
    model: "flux"
  }) 
  const imageParamsRef = useRef(imageParams) // Reference to current state for use in callbacks
  const initializedRef = useRef(false) // Track if we've initialized from props

  // ─── EFFECTS ─────────────────────────────────────────────────────────────────
  // Load image parameters into local state whenever `image` changes
  useEffect(() => {
    // Log received image for debugging
    console.log("ImageEditor received image:", image);
    
    // Only set parameters from image if:
    // 1. We haven't initialized yet, or
    // 2. The image URL has changed (indicating a completely new image)
    if (!initializedRef.current || (image && image.imageURL !== imageParamsRef.current.imageURL)) {
      console.log("Setting initial parameters from image");
      setImageParams(prevParams => ({
        ...prevParams,
        ...(image || {})
      }));
      initializedRef.current = true;
    }
  }, [image])

  // Update the ref whenever local imageParams changes
  useEffect(() => {
    imageParamsRef.current = imageParams
  }, [imageParams])

  // Destructuring parameters from imageParams
  const { width, height, seed, enhance = false, nologo = false, model } = imageParams

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

    // Track event for input changes (excluding width and height, which are tracked onBlur)
    if (typeof trackEvent === "function" && param !== "width" && param !== "height") {
      trackEvent({
        action: `change_${param}`,
        category: "feed",
        value: newValue,
      })
    }
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
          category: "feed",
          action: "click_create_bump_seed",
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
          category: "feed",
          action: "click_create",
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
      console.log(`Changing parameter ${param} to:`, value);
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
    
    // Make sure to include all necessary parameters, especially prompt
    updateImage({
      ...currentImageParams,
      prompt: currentImageParams.prompt || image?.prompt || "",
      imageURL,
    })
  }, [updateImage, image?.prompt])

  // ─── STYLES: BUTTONS, MENU, ANIMATIONS ─────────────────────────────────────

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
  `

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        border: "none",
        boxShadow: "none",
        backgroundColor: "transparent",
      }}
    >
      <Grid container spacing={2}>
        {/* Conditional Rendering of Controls in Edit Mode */}
        {toggleValue === "edit" && (
          <>
            {/* Model Selector */}
            <Grid size={{ xs: 12, sm: 4, md: 2 }}>
              <ModelSelector
                itemType="image"
                currentModel={model || "flux"}
                onModelChange={(value) => handleInputChange("model", value)}
                isLoading={isLoading}
                onFocus={handleFocus}
                tooltipText={IMAGE_FEED_TOOLTIP_MODEL}
                setIsInputChanged={setIsInputChanged}
                styles={PARAM_STYLES}
              />
            </Grid>

            {/* Width Input */}
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <ParameterNumberInput
                label="Width"
                value={width}
                onChange={(value) => handleInputChange("width", value)}
                onFocus={handleFocus}
                tooltipText={IMAGE_FEED_TOOLTIP_WIDTH}
                paramName="width"
                setIsInputChanged={setIsInputChanged}
                styles={PARAM_STYLES}
              />
            </Grid>

            {/* Height Input */}
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <ParameterNumberInput
                label="Height"
                value={height}
                onChange={(value) => handleInputChange("height", value)}
                onFocus={handleFocus}
                tooltipText={IMAGE_FEED_TOOLTIP_HEIGHT}
                paramName="height"
                setIsInputChanged={setIsInputChanged}
                styles={PARAM_STYLES}
              />
            </Grid>

            {/* Seed Input */}
            <Grid size={{ xs: 4, sm: 4, md: 2 }}>
              <ParameterNumberInput
                label="Seed"
                value={seed}
                onChange={(value) => handleInputChange("seed", value)}
                onFocus={handleFocus}
                tooltipText={IMAGE_FEED_TOOLTIP_SEED}
                paramName="seed"
                setIsInputChanged={setIsInputChanged}
                styles={PARAM_STYLES}
              />
            </Grid>

            {/* Enhance Checkbox */}
            <Grid size={{ xs: 4, sm: 2, md: 1 }}>
              <ParameterCheckbox
                label="Enhance"
                checked={enhance}
                onChange={(value) => handleInputChange("enhance", value)}
                onFocus={handleFocus}
                tooltipText={IMAGE_FEED_ENANCER_TOOLTIP}
                paramName="enhance"
                setIsInputChanged={setIsInputChanged}
                styles={PARAM_STYLES}
              />
            </Grid>

            {/* Logo Checkbox */}
            <Grid size={{ xs: 4, sm: 2, md: 1 }}>
              <ParameterCheckbox
                label="Logo"
                checked={!nologo}
                onChange={(value) => handleInputChange("nologo", !value)}
                onFocus={handleFocus}
                tooltipText={IMAGE_FEED_LOGO_WATERMARK}
                paramName="nologo"
                setIsInputChanged={setIsInputChanged}
                styles={PARAM_STYLES}
              />
            </Grid>

            {/* Submit Button */}
            <Grid size={{ xs: 12, sm: 4, md: 2 }} style={{ marginTop: "24px" }}>
              <GeneralButton
                handleClick={handleButtonClick}
                isLoading={isLoading}
                isInputChanged={isInputChanged}
                borderColor={Colors.lime}
                backgroundColor={Colors.offblack}
                textColor={Colors.lime}
                fontSize="1.5em"
                style={{
                  width: "100%",
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

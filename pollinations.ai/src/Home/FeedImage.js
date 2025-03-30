import React, { useState, useEffect, memo, useCallback, useRef } from "react"
import { Box, CircularProgress } from "@mui/material"
import { useFeedLoader } from "../utils/useFeedLoader"
import { useImageEditor, useImageSlideshow } from "../utils/useImageSlideshow"
import { ServerLoadInfo } from "../components/Feeds/ServerLoadInfo.js"
import { Colors, SectionBG } from "../config/global"
import { ModelInfo } from "../components/Feeds/ModelInfo.js"
import { ImageEditor } from "../components/Feeds/ImageEditor.js"
import { FeedEditSwitch } from "../components/Feeds/FeedEditSwitch.js"
import { ImageDisplay } from "../components/Feeds/ImageDisplay.js"
import { PromptDisplay } from "../components/Feeds/PromptDisplay.js"
import {
  SectionContainer,
  SectionSubContainer,
  SectionHeadlineStyle,
  SectionMainContent,
} from "../components/SectionContainer"
import SectionTitle from "../components/SectionTitle"
import {
  IMAGE_FEED_SUBTITLE,
  IMAGE_FEED_TITLE,
  IMAGE_FEED_MODE1,
  IMAGE_FEED_MODE2,
  IMAGE_FEED_TOOLTIP_PROMPT,
} from "../config/copywrite"
import { emojify, rephrase, noLink } from "../config/llmTransforms.js"
import { LLMTextManipulator } from "../components/LLMTextManipulator.js"
import { trackEvent } from "../config/analytics"

/**
 * FeedImage:
 * Main component to handle the display, editing, and associated UI for feed images.
 * Uses a slideshow approach (useImageSlideshow) and an editor (useImageEditor).
 */
export const FeedImage = memo(() => {
  // -----------------------------
  // Local State
  // -----------------------------
  /** Holds the last recognized image (for display or info). */
  const [lastImage, setLastImage] = useState(null)

  /** Indicates if the user has edited input fields (e.g. prompt, model, etc.). */
  const [isInputChanged, setIsInputChanged] = useState(false)

  /** Tracks the user's edited prompt separately from the feed prompt */
  const [userEditedPrompt, setUserEditedPrompt] = useState(null)

  /** Toggles the mode between "feed" or "edit". */
  const [toggleValue, setToggleValue] = useState("feed")

  // For handling parameter changes directly
  const [modifiedImageParams, setModifiedImageParams] = useState(null)

  // Ref to track if we've initialized the edit mode parameters
  const editModeInitializedRef = useRef(false)

  // -----------------------------
  // Hooks
  // -----------------------------
  /** Slideshow-related data and methods. */
  const { image: slideshowImage, onNewImage, stop, isStopped } = useImageSlideshow()

  /** Image editor methods and states. */
  const { updateImage, cancelLoading, image, isLoading } = useImageEditor({
    stop,
    image: slideshowImage,
  })

  /** Additional feed loading data. */
  const { imagesGenerated } = useFeedLoader(onNewImage, setLastImage)

  // -----------------------------
  // Effects
  // -----------------------------
  /**
   * Reset isInputChanged whenever the image's URL changes.
   * Typically happens after a new image is loaded or updated.
   */
  useEffect(() => {
    setIsInputChanged(false)
  }, [image?.imageURL])

  /**
   * Reset the editModeInitializedRef when switching back to feed mode
   * This ensures that the next time we switch to edit mode, we'll initialize parameters again
   */
  useEffect(() => {
    if (toggleValue === "feed") {
      editModeInitializedRef.current = false
      setModifiedImageParams(null)
    }
  }, [toggleValue])

  // Pass modified image parameters to the ImageEditor
  // Ensure the effectiveImage always has defined values for number inputs
  const effectiveImage = {
    width: 512, // Default width
    height: 512, // Default height
    seed: 0, // Default seed
    enhance: false,
    nologo: false,
    model: "flux",
    ...(image || {}), // Layer in current image values
    ...(modifiedImageParams || {}), // Apply any user modifications
    // Override prompt with edited version if we're in edit mode and have a user edit
    prompt: toggleValue === "edit" && userEditedPrompt !== null 
      ? userEditedPrompt 
      : (modifiedImageParams?.prompt || image?.prompt || ""),
  }

  // Initialize user edited prompt when switching to edit mode for the first time
  useEffect(() => {
    if (toggleValue === "edit" && userEditedPrompt === null && image?.prompt) {
      setUserEditedPrompt(image.prompt);
    }
  }, [toggleValue, userEditedPrompt, image]);

  // -----------------------------
  // Handlers
  // -----------------------------
  /**
   * Handler for switching between "feed" and "edit" modes.
   * Calls 'stop' with a boolean to indicate if we should pause slideshow.
   * Tracks the event with a boolean value indicating the mode.
   */
  const handleToggleChange = (event, newValue) => {
    if (newValue !== null) {
      const isEditMode = newValue === "edit"
      stop(isEditMode) // First stop/start the slideshow
      setToggleValue(newValue) // Then update the toggle value

      // When switching to edit mode, copy current image parameters, but only the first time
      if (isEditMode && image && !editModeInitializedRef.current) {
        setModifiedImageParams({ ...image })
        
        // Initialize user edited prompt if needed
        if (userEditedPrompt === null && image.prompt) {
          setUserEditedPrompt(image.prompt)
        }
        
        editModeInitializedRef.current = true
      }

      trackEvent({
        action: "click_feed_edit_switch",
        category: "feed",
        value: isEditMode ? "edit" : "feed",
      })
    }
  }

  // Handler for image parameter changes (prompt, width, height, etc.)
  const handleParamChange = useCallback(
    (param, value) => {
      setIsInputChanged(true)

      // For prompt changes, update modifiedImageParams to include the prompt
      if (param === "prompt") {
        // Store the prompt in modifiedImageParams as well
        setModifiedImageParams((prevParams) => {
          const baseParams = prevParams || (image ? { ...image } : {})
          return {
            ...baseParams,
            prompt: value,
          }
        })
        return;
      }

      // Create or update modified params object
      setModifiedImageParams((prevParams) => {
        // Use callback form of setState to avoid dependency on external `image`
        const baseParams = prevParams || (image ? { ...image } : {})
        return {
          ...baseParams,
          [param]: value,
        }
      })

      // If we're not in edit mode, switch to it
      if (toggleValue !== "edit") {
        handleToggleChange(null, "edit")
      }
    },
    [toggleValue, handleToggleChange, image]
  )

  // -----------------------------
  // Rendering
  // -----------------------------
  return (
    <SectionContainer id="image-feed" backgroundConfig={SectionBG.feedImage} >
      <SectionMainContent>
        {/* Title Section */}
        <SectionSubContainer>
          <SectionTitle title={IMAGE_FEED_TITLE} />
        </SectionSubContainer>

        {/* Server Load Information */}
        <SectionSubContainer>
          <ServerLoadInfo
            lastItem={lastImage}
            itemsGenerated={imagesGenerated}
            currentItem={image}
            itemType="image"
          />
        </SectionSubContainer>
        {/* Subheading / LLM Banner */}
        <SectionSubContainer>
          <SectionHeadlineStyle>
            <LLMTextManipulator
              text={IMAGE_FEED_SUBTITLE}
              transforms={[rephrase, emojify, noLink]}
            />
          </SectionHeadlineStyle>
        </SectionSubContainer>

        {/* Main Content Section */}
        <SectionSubContainer paddingBottom="0em">
          {image?.imageURL && (
            <Box
              sx={{
                backgroundColor: "transparent",
                width: "100%",
              }}
            >
              {/* Option Switch (Feed vs Edit) */}
              <Box display="flex" justifyContent="center" mb={2}>
                <FeedEditSwitch
                  toggleValue={toggleValue}
                  handleToggleChange={handleToggleChange}
                  isLoading={isLoading}
                  feedModeText1={IMAGE_FEED_MODE1}
                  feedModeText2={IMAGE_FEED_MODE2}
                />
              </Box>

              {/* Prompt Display */}
              <Box width="100%" mb={2}>
                <PromptDisplay
                  itemType="image"
                  item={image}
                  isLoading={isLoading}
                  isEditMode={toggleValue === "edit"}
                  onPromptChange={(newPrompt) => {
                    setUserEditedPrompt(newPrompt)
                    handleParamChange("prompt", newPrompt)
                  }}
                  onEditModeSwitch={() => handleToggleChange(null, "edit")}
                  setIsInputChanged={setIsInputChanged}
                  promptTooltip="Prompt"
                  backgroundColor={Colors.offblack2}
                  sharedPrompt={toggleValue === "edit" ? userEditedPrompt : undefined}
                />
              </Box>

              {/* Image Editor Controls - Only in Edit Mode */}
              {toggleValue === "edit" && (
                <Box paddingBottom="1em">
                  <ImageEditor
                    image={{
                      ...effectiveImage,
                      // Ensure the newest prompt is passed in the correct priority:
                      // 1. User edited prompt (from edit mode)
                      // 2. Modified params prompt (from other parameter changes)
                      // 3. Original image prompt (from feed)
                      prompt: userEditedPrompt || modifiedImageParams?.prompt || image?.prompt || ""
                    }}
                    isLoading={isLoading}
                    setIsInputChanged={setIsInputChanged}
                    isInputChanged={isInputChanged}
                    isStopped={isStopped}
                    switchToEditMode={() => handleToggleChange(null, "edit")}
                    edit={isStopped}
                    toggleValue={toggleValue}
                    handleToggleChange={handleToggleChange}
                    stop={stop}
                    cancelLoading={cancelLoading}
                    updateImage={updateImage}
                  />
                </Box>
              )}
            </Box>
          )}

          {/* If no image is currently available, show loader. Otherwise, display the loaded image. */}
          {!image?.imageURL ? (
            <SectionSubContainer>
              <CircularProgress sx={{ color: Colors.lime }} />
            </SectionSubContainer>
          ) : (
            <ImageDisplay image={image} isLoading={isLoading}/>
          )}

          {/* If we're in "feed" mode and have an image, show model info. */}
          {toggleValue === "feed" && (
            <SectionSubContainer paddingBottom="0em"> 
              <br />
              {image?.imageURL && (
                <ModelInfo model={image.model} referrer={image.referrer} itemType="image" />
              )}
            </SectionSubContainer>
          )}
        </SectionSubContainer>
      </SectionMainContent>
    </SectionContainer>
  )
})

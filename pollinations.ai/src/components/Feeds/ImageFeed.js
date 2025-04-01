import React, { useState, useEffect, memo, useCallback, useRef } from "react"
import { Box, CircularProgress } from "@mui/material"
import { useFeedLoader } from "../../utils/useFeedLoader" // Adjusted path
import { useImageEditor, useImageSlideshow } from "../../utils/useImageSlideshow" // Adjusted path
import { ServerLoadInfo } from "./ServerLoadInfo.js" // Adjusted path (assuming it's in the same dir now)
import { Colors } from "../../config/global" // Adjusted path
import { ModelInfo } from "./ModelInfo.js" // Adjusted path
import { ImageEditor } from "./ImageEditor.js" // Adjusted path
import { FeedEditSwitch } from "./FeedEditSwitch.js" // Adjusted path
import { ImageDisplay } from "./ImageDisplay.js" // Adjusted path
import { PromptDisplay } from "./PromptDisplay.js" // Adjusted path
import {
  SectionSubContainer, // Keep SubContainer
  SectionHeadlineStyle,
} from "../SectionContainer" // Adjusted path
// Removed SectionContainer, SectionMainContent, SectionTitle imports
import {
  IMAGE_FEED_SUBTITLE,
  // IMAGE_FEED_TITLE, // Removed title import
  IMAGE_FEED_MODE1,
  IMAGE_FEED_MODE2,
  IMAGE_FEED_TOOLTIP_PROMPT,
} from "../../config/copywrite" // Adjusted path
import { emojify, rephrase, noLink } from "../../config/llmTransforms.js" // Adjusted path
import { LLMTextManipulator } from "../LLMTextManipulator.js" // Adjusted path
import { trackEvent } from "../../config/analytics" // Adjusted path

/**
 * ImageFeed (Refactored):
 * Inner content for the image feed section.
 * Assumes it's rendered within a container that handles the main section layout and title.
 */
export const ImageFeed = memo(() => {
  // ... (Keep all state, hooks, effects, handlers as they were) ...
  // State
  const [lastImage, setLastImage] = useState(null)
  const [isInputChanged, setIsInputChanged] = useState(false)
  const [userEditedPrompt, setUserEditedPrompt] = useState(null)
  const [toggleValue, setToggleValue] = useState("feed")
  const [modifiedImageParams, setModifiedImageParams] = useState(null)
  const editModeInitializedRef = useRef(false)

  // Hooks
  const { image: slideshowImage, onNewImage, stop, isStopped } = useImageSlideshow()
  const { updateImage, cancelLoading, image, isLoading } = useImageEditor({
    stop,
    image: slideshowImage,
  })
  const { imagesGenerated } = useFeedLoader(onNewImage, setLastImage)

  // Effects
  useEffect(() => {
    setIsInputChanged(false)
  }, [image?.imageURL])

  useEffect(() => {
    if (toggleValue === "feed") {
      editModeInitializedRef.current = false
      setModifiedImageParams(null)
    }
  }, [toggleValue])

  useEffect(() => {
    if (toggleValue === "edit" && userEditedPrompt === null && image?.prompt) {
      setUserEditedPrompt(image.prompt)
    }
  }, [toggleValue, userEditedPrompt, image])

  // Add effect to update prompt when image changes in feed mode
  useEffect(() => {
    if (toggleValue === "feed" && image?.prompt && image !== slideshowImage) {
      setUserEditedPrompt(image.prompt)
    }
  }, [toggleValue, image, slideshowImage])

  const effectiveImage = {
    width: 512,
    height: 512,
    seed: 0,
    enhance: false,
    nologo: false,
    model: "flux",
    ...(image || {}),
    ...(modifiedImageParams || {}),
    prompt:
      toggleValue === "edit" && userEditedPrompt !== null
        ? userEditedPrompt
        : modifiedImageParams?.prompt || image?.prompt || "",
  }

  // Handlers
  const handleToggleChange = (event, newValue) => {
    if (newValue !== null) {
      const isEditMode = newValue === "edit"
      stop(isEditMode)
      setToggleValue(newValue)

      if (isEditMode && image) {
        setModifiedImageParams({ ...image })
        // Always update the prompt when switching to edit mode
        setUserEditedPrompt(image.prompt || "")
        editModeInitializedRef.current = true
      }

      trackEvent({
        action: "click_feed_edit_switch",
        category: "feed",
        value: isEditMode ? "edit" : "feed",
      })
    }
  }

  const handleParamChange = useCallback(
    (param, value) => {
      setIsInputChanged(true)
      if (param === "prompt") {
        setModifiedImageParams((prevParams) => {
          const baseParams = prevParams || (image ? { ...image } : {})
          return {
            ...baseParams,
            prompt: value,
          }
        })
        return
      }
      setModifiedImageParams((prevParams) => {
        const baseParams = prevParams || (image ? { ...image } : {})
        return {
          ...baseParams,
          [param]: value,
        }
      })
      if (toggleValue !== "edit") {
        handleToggleChange(null, "edit")
      }
    },
    [toggleValue, handleToggleChange, image]
  )

  // Rendering - REMOVED SectionContainer and SectionMainContent wrappers
  // REMOVED Title Section
  return (
    <Box>
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
          <LLMTextManipulator text={IMAGE_FEED_SUBTITLE} transforms={[rephrase, emojify, noLink]} />
        </SectionHeadlineStyle>
      </SectionSubContainer>

      {/* Main Content Section */}
      <SectionSubContainer 
        paddingBottom="0em" 
        alignItems="stretch"
        sx={{ maxWidth: "900px" }}
      >
        {image?.imageURL && (
          <Box
            sx={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
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
            <Box 
              width="100%" 
              maxWidth="1000px"
              mb={2}
            >
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
                promptTooltip={IMAGE_FEED_TOOLTIP_PROMPT} // Use constant
                backgroundColor={Colors.offblack2}
                sharedPrompt={toggleValue === "edit" ? userEditedPrompt : undefined}
                style={{ width: '100%', minWidth: '100%' }} // Force full width
              />
            </Box>

            {/* Image Editor Controls - Only in Edit Mode */}
            {toggleValue === "edit" && (
              <Box width="100%" mb={2}>
                <ImageEditor
                  image={{
                    ...effectiveImage,
                    prompt: userEditedPrompt || modifiedImageParams?.prompt || image?.prompt || "",
                  }}
                  isLoading={isLoading}
                  setIsInputChanged={setIsInputChanged}
                  isInputChanged={isInputChanged}
                  isStopped={isStopped}
                  switchToEditMode={() => handleToggleChange(null, "edit")}
                  edit={isStopped} // Assuming 'edit' prop controls editability based on isStopped
                  toggleValue={toggleValue}
                  handleToggleChange={handleToggleChange}
                  stop={stop}
                  cancelLoading={cancelLoading}
                  updateImage={updateImage}
                />
              </Box>
            )}
            
            {/* Image Display - moved inside the same Box as PromptDisplay */}
            <Box width="100%" maxWidth="1000px">
              <ImageDisplay image={image} isLoading={isLoading} />
            </Box>
          </Box>
        )}

        {/* If no image is currently available, show loader. */}
        {!image?.imageURL && (
          <SectionSubContainer width="100%">
            <CircularProgress sx={{ color: Colors.lime }} />
          </SectionSubContainer>
        )}

        {/* If we're in "feed" mode and have an image, show model info. */}
        {toggleValue === "feed" && (
          <SectionSubContainer paddingBottom="0em" width="100%">
            <br />
            {image?.imageURL && (
              <ModelInfo model={image.model} referrer={image.referrer} itemType="image" />
            )}
          </SectionSubContainer>
        )}
      </SectionSubContainer>
    </Box>
  )
})

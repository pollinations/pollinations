import React, { useState, useEffect, memo, useCallback } from "react";
import { Box, CircularProgress } from "@mui/material";
import { useFeedLoader } from "../utils/useFeedLoader";
import { useImageEditor, useImageSlideshow } from "../utils/useImageSlideshow";
import { ServerLoadInfo } from "../components/FeedImage/ServerLoadInfo";
import { Colors, SectionBG } from "../config/global";
import { ModelInfo } from "../components/FeedImage/ModelInfo";
import { ImageEditor } from "../components/FeedImage/ImageEditor";
import { FeedEditSwitch } from "../components/FeedImage/FeedEditSwitch";
import { ImageDisplay } from "../components/FeedImage/ImageDisplay";
import { SectionContainer, SectionSubContainer, SectionHeadlineStyle } from "../components/SectionContainer";
import SectionTitle from "../components/SectionTitle";
import { IMAGE_FEED_SUBTITLE, IMAGE_FEED_TITLE } from "../config/copywrite";
import { emojify, rephrase, noLink } from "../config/llmTransforms.js";
import { LLMTextManipulator } from "../components/LLMTextManipulator.js";
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
  const [lastImage, setLastImage] = useState(null);

  /** Indicates if the user has edited input fields (e.g. prompt, model, etc.). */
  const [isInputChanged, setIsInputChanged] = useState(false);

  /** Toggles the mode between "feed" or "edit". */
  const [toggleValue, setToggleValue] = useState("feed");

  // -----------------------------
  // Hooks
  // -----------------------------
  /** Slideshow-related data and methods. */
  const { image: slideshowImage, onNewImage, stop, isStopped } = useImageSlideshow();

  /** Image editor methods and states. */
  const { updateImage, cancelLoading, image, isLoading } = useImageEditor({
    stop,
    image: slideshowImage,
  });

  /** Additional feed loading data. */
  const { imagesGenerated } = useFeedLoader(onNewImage, setLastImage);

  // -----------------------------
  // Effects
  // -----------------------------
  /**
   * Reset isInputChanged whenever the image's URL changes.
   * Typically happens after a new image is loaded or updated.
   */
  useEffect(() => {
    setIsInputChanged(false);
  }, [image?.imageURL]);

  // -----------------------------
  // Handlers
  // -----------------------------
  /** Forcefully switch the toggleValue to "edit". */
  const switchToEditMode = useCallback(() => {
    trackEvent({
      action: 'click_switch_mode',
      category: 'feed',
    });
    setToggleValue("edit");
  }, []);

  /**
   * Handler for switching between "feed" and "edit" modes.
   * Calls 'stop' with a boolean to indicate if we should pause slideshow.
   */
  const handleToggleChange = (event, newValue) => {
    if (newValue !== null) {
      stop(newValue === "edit");  // First stop/start the slideshow
      setToggleValue(newValue);   // Then update the toggle value
    }
  };

  // -----------------------------
  // Rendering
  // -----------------------------
  return (
    <SectionContainer backgroundConfig={SectionBG.feedImage}>
      {/* Title Section */}
      <SectionSubContainer>
        <SectionTitle title={IMAGE_FEED_TITLE} />
      </SectionSubContainer>

      {/* Server Load Information */}
      <SectionSubContainer>
        <ServerLoadInfo lastImage={lastImage} imagesGenerated={imagesGenerated} image={image} />
      </SectionSubContainer>

      {/* Subheading / LLM Banner */}
      <SectionSubContainer>
        <SectionHeadlineStyle>
          <LLMTextManipulator text={IMAGE_FEED_SUBTITLE} transforms={[rephrase, emojify, noLink]} />
        </SectionHeadlineStyle>
      </SectionSubContainer>

      {/* Main Content Section */}
      <SectionSubContainer>
        {image?.imageURL && (
          <Box
            sx={{
              backgroundColor: `${Colors.offblack2}0`,
              width: "100%",
            }}
          >
            {/* Option Switch (Feed vs Edit) */}
            <Box display="flex" justifyContent="center" mb={2}>
              <FeedEditSwitch
                toggleValue={toggleValue}
                handleToggleChange={handleToggleChange}
                isLoading={isLoading}
              />
            </Box>

            {/* Image Editor */}
            <Box paddingBottom="1em">
              <ImageEditor
                image={image}
                isLoading={isLoading}
                setIsInputChanged={setIsInputChanged}
                isInputChanged={isInputChanged}
                isStopped={isStopped}
                switchToEditMode={switchToEditMode}
                edit={isStopped}
                toggleValue={toggleValue}
                handleToggleChange={handleToggleChange}
                stop={stop}
                cancelLoading={cancelLoading}
                updateImage={updateImage}
              />
            </Box>
          </Box>
        )}

        {/* If no image is currently available, show loader. Otherwise, display the loaded image. */}
        {!image?.imageURL ? (
          <SectionSubContainer>
            <CircularProgress sx={{ color: Colors.lime }} />
          </SectionSubContainer>
        ) : (
          <ImageDisplay image={image} isLoading={isLoading} />
        )}

        {/* If we're in "feed" mode and have an image, show model info. */}
        {toggleValue === "feed" && (
          <SectionSubContainer>
            <br />
            {image?.imageURL && <ModelInfo model={image.model} referrer={image.referrer} />}
          </SectionSubContainer>
        )}
      </SectionSubContainer>
    </SectionContainer>
  );
});

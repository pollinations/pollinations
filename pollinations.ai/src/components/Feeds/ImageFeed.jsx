import React, { useState, useEffect, memo, useCallback, useRef } from "react";
import { Box, CircularProgress } from "@mui/material";
import { useFeedLoader } from "../../utils/useFeedLoader"; // Adjusted path
import {
    useImageEditor,
    useImageSlideshow,
} from "../../utils/useImageSlideshow"; // Adjusted path
import { ServerLoadInfo } from "./ServerLoadInfo.jsx"; // Adjusted path (assuming it's in the same dir now)
import { Colors } from "../../config/global"; // Adjusted path
import { ModelInfo } from "./ModelInfo.jsx"; // Adjusted path
import { ImageEditor } from "./ImageEditor.jsx"; // Adjusted path
import { FeedEditSwitch } from "./FeedEditSwitch.jsx"; // Adjusted path
import { ImageDisplay } from "./ImageDisplay.jsx"; // Adjusted path
import { PromptDisplay } from "./PromptDisplay.jsx"; // Adjusted path
import {
    SectionSubContainer, // Keep SubContainer
    SectionHeadlineStyle,
} from "../SectionContainer"; // Adjusted path
// Removed SectionContainer, SectionMainContent, SectionTitle imports
import {
    IMAGE_FEED_SUBTITLE,
    // IMAGE_FEED_TITLE, // Removed title import
    IMAGE_FEED_MODE1,
    IMAGE_FEED_MODE2,
    IMAGE_FEED_TOOLTIP_PROMPT,
} from "../../config/copywrite"; // Adjusted path
import { emojify, rephrase, noLink } from "../../config/llmTransforms.js"; // Adjusted path
import { LLMTextManipulator } from "../LLMTextManipulator.jsx"; // Adjusted path
import { trackEvent } from "../../config/analytics.js"; // Adjusted path

/**
 * ImageFeed (Refactored):
 * Inner content for the image feed section.
 * Assumes it's rendered within a container that handles the main section layout and title.
 */
export const ImageFeed = memo(({ mode }) => {
    // ... (Keep all state, hooks, effects, handlers as they were) ...
    // State
    const [lastImage, setLastImage] = useState(null);
    const [isInputChanged, setIsInputChanged] = useState(false);
    const [userEditedPrompt, setUserEditedPrompt] = useState(null);
    const [toggleValue, setToggleValue] = useState("feed");
    const [modifiedImageParams, setModifiedImageParams] = useState(null);
    const editModeInitializedRef = useRef(false);

    // Hooks
    const {
        image: slideshowImage,
        onNewImage,
        stop,
        isStopped,
    } = useImageSlideshow();
    const { updateImage, cancelLoading, image, isLoading } = useImageEditor({
        stop,
        image: slideshowImage,
    });
    const { imagesGenerated } = useFeedLoader(onNewImage, setLastImage, mode);

    // Determine the current image to display based on mode
    const currentImage = toggleValue === "feed" ? slideshowImage : image;

    // Effects
    useEffect(() => {
        setIsInputChanged(false);
    }, [image?.imageURL]);

    useEffect(() => {
        if (toggleValue === "feed") {
            editModeInitializedRef.current = false;
            setModifiedImageParams(null);
        }
    }, [toggleValue]);

    useEffect(() => {
        if (
            toggleValue === "edit" &&
            userEditedPrompt === null &&
            image?.prompt
        ) {
            setUserEditedPrompt(image.prompt);
        }
    }, [toggleValue, userEditedPrompt, image]);

    useEffect(() => {
        if (
            toggleValue === "feed" &&
            image?.prompt &&
            image !== slideshowImage
        ) {
            setUserEditedPrompt(image.prompt);
        }
    }, [toggleValue, image, slideshowImage]);

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
    };

    // Handlers
    const handleToggleChange = (event, newValue) => {
        if (newValue !== null) {
            const isEditMode = newValue === "edit";
            stop(isEditMode);
            setToggleValue(newValue);

            if (isEditMode && image) {
                setModifiedImageParams({ ...image });
                setUserEditedPrompt(image.prompt || "");
                editModeInitializedRef.current = true;
            }

            trackEvent({
                action: "click_feed_edit_switch",
                category: "feed",
                value: isEditMode ? "edit" : "feed",
            });
        }
    };

    const handleParamChange = useCallback(
        (param, value) => {
            setIsInputChanged(true);
            const baseParams =
                modifiedImageParams || (image ? { ...image } : {});

            if (param === "prompt") {
                setModifiedImageParams((prevParams) => ({
                    ...(prevParams || baseParams),
                    prompt: value,
                }));
                return;
            } else {
                setModifiedImageParams((prevParams) => ({
                    ...(prevParams || baseParams),
                    [param]: value,
                }));
            }

            if (toggleValue !== "edit") {
                handleToggleChange(null, "edit");
            }
        },
        [toggleValue, handleToggleChange, image, modifiedImageParams],
    );

    // Rendering - REMOVED SectionContainer and SectionMainContent wrappers
    // REMOVED Title Section
    return (
        <Box>
            {/* Subheading / LLM Banner */}
            <SectionSubContainer>
                <SectionHeadlineStyle>
                    <LLMTextManipulator
                        text={IMAGE_FEED_SUBTITLE}
                        transforms={[rephrase, emojify, noLink]}
                    />
                </SectionHeadlineStyle>
            </SectionSubContainer>
            {/* Server Load Information */}
            <SectionSubContainer>
                <ServerLoadInfo
                    lastItem={lastImage}
                    itemsGenerated={imagesGenerated}
                    currentItem={currentImage}
                    itemType="image"
                />
            </SectionSubContainer>
            {/* Main Content Section */}
            <SectionSubContainer
                paddingBottom="4em"
                alignItems="stretch"
                sx={{ maxWidth: "900px" }}
            >
                {currentImage?.imageURL && (
                    <Box
                        sx={{
                            width: "100%",
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        {/* Option Switch (Feed vs Edit) */}
                        <Box display="flex" justifyContent="center" mb={4}>
                            <FeedEditSwitch
                                toggleValue={toggleValue}
                                handleToggleChange={handleToggleChange}
                                isLoading={isLoading}
                                feedModeText1={IMAGE_FEED_MODE1}
                                feedModeText2={IMAGE_FEED_MODE2}
                            />
                        </Box>

                        {/* Prompt Display */}
                        <Box width="100%" maxWidth="1000px" mb={1}>
                            <PromptDisplay
                                itemType="image"
                                item={currentImage}
                                isLoading={isLoading}
                                isEditMode={toggleValue === "edit"}
                                onPromptChange={(newPrompt) => {
                                    setUserEditedPrompt(newPrompt);
                                    handleParamChange("prompt", newPrompt);
                                }}
                                onEditModeSwitch={() =>
                                    handleToggleChange(null, "edit")
                                }
                                setIsInputChanged={setIsInputChanged}
                                promptTooltip={IMAGE_FEED_TOOLTIP_PROMPT}
                                backgroundColor={Colors.offblack2}
                                sharedPrompt={
                                    toggleValue === "edit"
                                        ? userEditedPrompt
                                        : undefined
                                }
                                style={{ width: "100%", minWidth: "100%" }}
                            />
                        </Box>

                        {/* Image Editor Controls - Only in Edit Mode */}
                        {toggleValue === "edit" && (
                            <Box width="100%" mb={1}>
                                <ImageEditor
                                    image={effectiveImage}
                                    isLoading={isLoading}
                                    setIsInputChanged={setIsInputChanged}
                                    isInputChanged={isInputChanged}
                                    isStopped={isStopped}
                                    edit={isStopped}
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
                            <ImageDisplay
                                image={currentImage}
                                isLoading={isLoading}
                            />
                        </Box>
                    </Box>
                )}

                {/* If no image is currently available, show loader. */}
                {!currentImage?.imageURL && (
                    <SectionSubContainer width="100%">
                        <CircularProgress sx={{ color: Colors.lime }} />
                    </SectionSubContainer>
                )}

                {/* If we're in "feed" mode and have an image, show model info. */}
                {toggleValue === "feed" && currentImage?.imageURL && (
                    <SectionSubContainer paddingBottom="0em" width="100%">
                        <ModelInfo
                            model={currentImage.model}
                            referrer={currentImage.referrer}
                            itemType="image"
                        />
                    </SectionSubContainer>
                )}
            </SectionSubContainer>
        </Box>
    );
});

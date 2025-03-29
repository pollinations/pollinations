import React, { useState, useEffect, memo, useCallback } from "react";
import { Box, CircularProgress, Button, Typography } from "@mui/material";
import { Colors, SectionBG, Fonts } from "../config/global";
import { SectionContainer, SectionSubContainer, SectionHeadlineStyle } from "../components/SectionContainer";
import SectionTitle from "../components/SectionTitle";
import { TEXT_FEED_TITLE, TEXT_FEED_SUBTITLE, TEXT_FEED_MODE1, TEXT_FEED_MODE2 } from "../config/copywrite";
import { emojify, rephrase, noLink } from "../config/llmTransforms.js";
import { LLMTextManipulator } from "../components/LLMTextManipulator.js";
import { trackEvent } from "../config/analytics";
import { useTextSlideshow } from "../utils/useTextSSEFeed"; // Consolidated SSE feed and slideshow functionality
import { useTextEditor } from "../utils/useTextEditor";
import { useTextFeedLoader } from "../utils/useTextFeedLoader";
import { ServerLoadInfo } from "../components/Feeds/ServerLoadInfo.js";
import { TextEditor } from "../components/Feeds/TextEditor.js";
import { TextDisplay } from "../components/Feeds/TextDisplay.js";
import { FeedEditSwitch } from "../components/Feeds/FeedEditSwitch.js";
import { ModelInfo } from "../components/Feeds/ModelInfo.js";
import { PromptDisplay } from "../components/Feeds/PromptDisplay.js";
import styled from "@emotion/styled";

// Styled components for the prompt display
const PromptContainer = styled(Box)`
  width: 100%;
  max-width: 1000px;
  margin-bottom: 16px;
`;

const LabelStyle = {
  color: `${Colors.offwhite}99`,
  fontSize: '1em',
  fontFamily: Fonts?.parameter || 'inherit',
  marginBottom: '4px'
};

/**
 * Extract prompt from messages array
 */
const extractPrompt = (messages) => {
  if (!messages || !Array.isArray(messages)) return null;
  const userMessage = messages.find(msg => msg?.role === 'user');
  return userMessage?.content || null;
};

/**
 * FeedText:
 * Main component to handle the display, editing, and associated UI for text feed.
 * Uses a slideshow approach (useTextSlideshow) and an editor (useTextEditor).
 */
export const FeedText = memo(() => {
  // -----------------------------
  // Local State
  // -----------------------------
  /** Holds the last received text entry (for display or info). */
  const [lastEntry, setLastEntry] = useState(null);

  /** Indicates if the user has edited input fields (e.g. prompt, model, etc.). */
  const [isInputChanged, setIsInputChanged] = useState(false);

  /** Toggles the mode between "feed" or "edit". */
  const [toggleValue, setToggleValue] = useState("feed");

  /** Shared prompt state to keep TextEditor components in sync */
  const [sharedPrompt, setSharedPrompt] = useState('');
  
  /** Shared model state to keep TextEditor components in sync */
  const [sharedModel, setSharedModel] = useState('openai');

  // -----------------------------
  // Hooks
  // -----------------------------
  /** Slideshow-related data and methods. */
  const { 
    entry: slideshowEntry, 
    onNewEntry, 
    stop, 
    isStopped, 
    error, 
    connectionStatus 
  } = useTextSlideshow();
  
  /** Text editor methods and states. */
  const { 
    updateText, 
    cancelGeneration, 
    entry, 
    isLoading 
  } = useTextEditor({
    stop,
    entry: slideshowEntry,
  });

  // Extract prompt and model from entry when it changes
  useEffect(() => {
    if (entry?.parameters?.messages && !isInputChanged) {
      const userMessage = entry.parameters.messages.find(msg => msg?.role === 'user');
      if (userMessage?.content) {
        setSharedPrompt(userMessage.content);
      }

      // Extract model from entry
      if (entry.parameters.model) {
        setSharedModel(entry.parameters.model);
      }
    }
  }, [entry, isInputChanged]);

  /** Additional feed loading data. */
  const { entriesGenerated } = useTextFeedLoader(onNewEntry, setLastEntry);

  // -----------------------------
  // Effects
  // -----------------------------
  /**
   * Reset isInputChanged whenever the text response changes.
   * Typically happens after a new text entry is loaded or updated.
   */
  useEffect(() => {
    setIsInputChanged(false);
  }, [entry?.response]);

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
      const isEditMode = newValue === "edit";
      stop(isEditMode);  // First stop/start the slideshow
      setToggleValue(newValue);   // Then update the toggle value
      trackEvent({
        action: 'click_text_feed_edit_switch',
        category: 'text_feed',
        value: isEditMode ? "edit" : "feed",
      });
    }
  };

  /**
   * Handler for clicking on the prompt in feed mode
   * Switches to edit mode
   */
  const handlePromptClick = useCallback(() => {
    if (toggleValue === "feed") {
      handleToggleChange(null, "edit");
      trackEvent({
        action: 'click_text_prompt',
        category: 'text_feed',
      });
    }
  }, [toggleValue, handleToggleChange]);

  // Modify the updateText method to use the shared prompt and model
  const handleUpdateText = useCallback((parameters) => {
    // Ensure sharedPrompt is a string
    const safeSharedPrompt = typeof sharedPrompt === 'string' ? sharedPrompt : '';
    
    // Use the shared state for the API call
    const updatedParameters = {
      ...parameters,
      model: sharedModel,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: safeSharedPrompt }
      ]
    };
    
    updateText(updatedParameters);
  }, [updateText, sharedPrompt, sharedModel]);

  // Extract prompt from entry if available (used for display only)
  const getPrompt = useCallback(() => {
    if (!entry?.parameters?.messages) return "";
    return extractPrompt(entry.parameters.messages) || "";
  }, [entry]);

  const prompt = getPrompt();

  // -----------------------------
  // Rendering
  // -----------------------------
  return (
    <SectionContainer id="text-feed" backgroundConfig={SectionBG.feedText}>
      {/* Title Section */}
      <SectionSubContainer>
        <SectionTitle title={TEXT_FEED_TITLE} />
      </SectionSubContainer>

      {/* Server Load Information */}
      <SectionSubContainer>
        <ServerLoadInfo 
          lastItem={lastEntry} 
          itemsGenerated={entriesGenerated} 
          currentItem={entry} 
          itemType="text"
        />
      </SectionSubContainer>

      {/* Subheading / LLM Banner */}
      <SectionSubContainer>
        <SectionHeadlineStyle>
          <LLMTextManipulator text={TEXT_FEED_SUBTITLE} transforms={[rephrase, emojify, noLink]} />
        </SectionHeadlineStyle>
      </SectionSubContainer>

      {/* Main Content Section */}
      <SectionSubContainer>
        {entry?.response && (
          <Box
            sx={{
              backgroundColor: `${Colors.offblack2}0`,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Option Switch (Feed vs Edit) */}
            <Box display="flex" justifyContent="center" mb={2} minWidth="400px">
              <FeedEditSwitch
                toggleValue={toggleValue}
                handleToggleChange={handleToggleChange}
                isLoading={isLoading}
                feedModeText1={TEXT_FEED_MODE1}
                feedModeText2={TEXT_FEED_MODE2}
              />
            </Box>
            
            {/* Prompt Display (unified approach for both modes) */}
            <Box width="100%" maxWidth="1000px" mb={2}>
              <PromptDisplay
                itemType="text"
                item={entry}
                isLoading={isLoading}
                isEditMode={toggleValue === "edit"}
                onPromptChange={(newPrompt) => {
                  setIsInputChanged(true);
                  if (setSharedPrompt) {
                    setSharedPrompt(newPrompt);
                  }
                }}
                onEditModeSwitch={handlePromptClick}
                setIsInputChanged={setIsInputChanged}
                promptTooltip="Prompt"
                sharedPrompt={sharedPrompt}
                setSharedPrompt={setSharedPrompt}
              />
            </Box>

            {/* Model Selection and Generate Button - Only in Edit Mode */}
            {toggleValue === "edit" && (
              <Box width="100%" mb={2}>
                <TextEditor
                  entry={entry}
                  isLoading={isLoading}
                  setIsInputChanged={setIsInputChanged}
                  isInputChanged={isInputChanged}
                  toggleValue={toggleValue}
                  updateText={handleUpdateText}
                  cancelGeneration={cancelGeneration}
                  controlsOnly={true}
                  // Pass shared state
                  sharedModel={sharedModel}
                  setSharedModel={setSharedModel}
                />
              </Box>
            )}

            {/* Text Display - Response Only */}
            <TextDisplay entry={entry} isLoading={isLoading} />
          </Box>
        )}

        {/* If no entry is currently available, show loader or error */}
        {!entry?.response && (
          <SectionSubContainer>
            <CircularProgress sx={{ color: Colors.lime }} />
          </SectionSubContainer>
        )}

        {/* If we're in "feed" mode and have an entry, show model info. */}
        {toggleValue === "feed" && entry?.response && (
          <SectionSubContainer>
            <br />
            <ModelInfo model={entry.parameters?.model} referrer={entry.referrer} itemType="text" />
          </SectionSubContainer>
        )}
      </SectionSubContainer>
    </SectionContainer>
  );
});
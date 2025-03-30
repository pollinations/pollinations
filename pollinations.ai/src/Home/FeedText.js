import React, { useState, useEffect, memo, useCallback } from "react";
import { Box, CircularProgress } from "@mui/material";
import { Colors, SectionBG } from "../config/global";
import { SectionContainer, SectionSubContainer, SectionHeadlineStyle } from "../components/SectionContainer";
import SectionTitle from "../components/SectionTitle";
import { TEXT_FEED_TITLE, TEXT_FEED_SUBTITLE, TEXT_FEED_MODE1, TEXT_FEED_MODE2 } from "../config/copywrite";
import { emojify, rephrase, noLink } from "../config/llmTransforms.js";
import { LLMTextManipulator } from "../components/LLMTextManipulator.js";
import { trackEvent } from "../config/analytics";
import { useTextSlideshow } from "../utils/useTextSSEFeed";
import { useTextEditor } from "../utils/useTextEditor";
import { useTextFeedLoader } from "../utils/useTextFeedLoader";
import { ServerLoadInfo } from "../components/Feeds/ServerLoadInfo.js";
import { TextEditor } from "../components/Feeds/TextEditor.js";
import { TextDisplay } from "../components/Feeds/TextDisplay.js";
import { FeedEditSwitch } from "../components/Feeds/FeedEditSwitch.js";
import { ModelInfo } from "../components/Feeds/ModelInfo.js";
import { PromptDisplay } from "../components/Feeds/PromptDisplay.js";

/**
 * Extract prompt from messages array
 */
const extractPrompt = (messages) => {
  if (!messages || !Array.isArray(messages)) return '';
  const userMessage = messages.find(msg => msg?.role === 'user');
  return userMessage?.content || '';
};

/**
 * FeedText:
 * Main component to handle the display, editing, and associated UI for text feed.
 */
export const FeedText = memo(() => {
  // State
  const [lastEntry, setLastEntry] = useState(null);
  const [isInputChanged, setIsInputChanged] = useState(false);
  const [toggleValue, setToggleValue] = useState("feed");
  const [sharedPrompt, setSharedPrompt] = useState('');
  const [sharedModel, setSharedModel] = useState('openai');

  // Hooks
  const { 
    entry: slideshowEntry, 
    onNewEntry, 
    stop, 
    error, 
    connectionStatus 
  } = useTextSlideshow();
  
  // Get entriesGenerated counter
  const { entriesGenerated } = useTextFeedLoader(onNewEntry, setLastEntry);
  
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
    if (!entry?.parameters?.messages || isInputChanged) return;
    
    // Update the shared prompt
    const prompt = extractPrompt(entry.parameters.messages);
    if (prompt) setSharedPrompt(prompt);
    
    // Update the model
    if (entry.parameters.model) setSharedModel(entry.parameters.model);
  }, [entry, isInputChanged]);

  // Reset isInputChanged when response changes
  useEffect(() => {
    setIsInputChanged(false);
  }, [entry?.response]);

  // Handle toggle between feed and edit modes
  const handleToggleChange = useCallback((event, newValue) => {
    if (newValue !== null) {
      const isEditMode = newValue === "edit";
      
      // Stop/start the slideshow
      stop(isEditMode);
      setToggleValue(newValue);
      
      // Track analytics
      trackEvent({
        action: 'click_text_feed_edit_switch',
        category: 'text_feed',
        value: isEditMode ? "edit" : "feed",
      });
    }
  }, [stop]);

  // Switch to edit mode when clicking prompt in feed mode
  const handlePromptClick = useCallback(() => {
    if (toggleValue === "feed") {
      handleToggleChange(null, "edit");
      trackEvent({
        action: 'click_text_prompt',
        category: 'text_feed',
      });
    }
  }, [toggleValue, handleToggleChange]);

  // Generate text with current values
  const handleUpdateText = useCallback((parameters = {}) => {
    updateText({
      model: sharedModel,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: sharedPrompt || '' }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      type: 'chat',
      ...parameters
    });
  }, [updateText, sharedPrompt, sharedModel]);

  return (
    <SectionContainer id="text-feed" backgroundConfig={SectionBG.feedText}>
      {/* Title */}
      <SectionSubContainer>
        <SectionTitle title={TEXT_FEED_TITLE} />
      </SectionSubContainer>

      {/* Server Load Info */}
      <SectionSubContainer>
        <ServerLoadInfo 
          lastItem={lastEntry}
          itemsGenerated={entriesGenerated}
          currentItem={entry} 
          itemType="text"
        />
      </SectionSubContainer>

      {/* Subtitle */}
      <SectionSubContainer>
        <SectionHeadlineStyle>
          <LLMTextManipulator text={TEXT_FEED_SUBTITLE} transforms={[rephrase, emojify, noLink]} />
        </SectionHeadlineStyle>
      </SectionSubContainer>

      {/* Main Content */}
      <SectionSubContainer>
        {entry?.response ? (
          <Box
            sx={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Feed/Edit Toggle */}
            <Box display="flex" justifyContent="center" mb={2} minWidth="400px">
              <FeedEditSwitch
                toggleValue={toggleValue}
                handleToggleChange={handleToggleChange}
                isLoading={isLoading}
                feedModeText1={TEXT_FEED_MODE1}
                feedModeText2={TEXT_FEED_MODE2}
              />
            </Box>
            
            {/* Prompt Display */}
            <Box width="100%" maxWidth="1000px" mb={2}>
              <PromptDisplay
                itemType="text"
                item={entry}
                isLoading={isLoading}
                isEditMode={toggleValue === "edit"}
                onPromptChange={(newPrompt) => {
                  setSharedPrompt(newPrompt);
                  setIsInputChanged(true);
                }}
                onEditModeSwitch={handlePromptClick}
                setIsInputChanged={setIsInputChanged}
                promptTooltip="Prompt"
                sharedPrompt={sharedPrompt}
                setSharedPrompt={setSharedPrompt}
              />
            </Box>

            {/* Controls (Edit mode only) */}
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
                  sharedModel={sharedModel}
                  setSharedModel={setSharedModel}
                />
              </Box>
            )}

            {/* Response Display */}
            <TextDisplay entry={entry} isLoading={isLoading} />
          </Box>
        ) : (
          <SectionSubContainer>
            <CircularProgress sx={{ color: Colors.lime }} />
          </SectionSubContainer>
        )}

        {/* Model Info (Feed mode only) */}
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
import React, { useState, useEffect, memo, useCallback } from "react";
import { Box, CircularProgress } from "@mui/material";
import { Colors } from "../../config/global"; // Adjusted path
import { SectionSubContainer, SectionHeadlineStyle } from "../SectionContainer"; // Adjusted path
import {
    TEXT_FEED_SUBTITLE,
    TEXT_FEED_MODE1,
    TEXT_FEED_MODE2,
} from "../../config/copywrite"; // Adjusted path
import { emojify, rephrase, noLink } from "../../config/llmTransforms.js"; // Adjusted path
import { LLMTextManipulator } from "../LLMTextManipulator.jsx"; // Adjusted path
import { trackEvent } from "../../config/analytics"; // Adjusted path
import { useTextSlideshow } from "../../utils/useTextSSEFeed"; // Adjusted path
import { useTextEditor } from "../../utils/useTextEditor"; // Adjusted path
import { useTextFeedLoader } from "../../utils/useTextFeedLoader"; // Adjusted path
import { ServerLoadInfo } from "./ServerLoadInfo.jsx"; // Adjusted path
import { TextEditor } from "./TextEditor.jsx"; // Adjusted path
import { TextDisplay } from "./TextResponse.jsx"; // Adjusted path
import { FeedEditSwitch } from "./FeedEditSwitch.jsx"; // Adjusted path
import { ModelInfo } from "./ModelInfo.jsx"; // Adjusted path
import { PromptDisplay } from "./PromptDisplay.jsx"; // Adjusted path

/**
 * Extract prompt from messages array
 */
const extractPrompt = (messages) => {
    if (!messages || !Array.isArray(messages)) return "";
    const userMessage = messages.find((msg) => msg?.role === "user");
    return userMessage?.content || "";
};

/**
 * TextFeed (Refactored):
 * Inner content for the text feed section.
 * Assumes it's rendered within a container that handles the main section layout and title.
 */
export const TextFeed = memo(({ mode }) => {
    // ... (Keep all state, hooks, effects, handlers as they were) ...
    // State
    const [lastEntry, setLastEntry] = useState(null);
    const [isInputChanged, setIsInputChanged] = useState(false);
    const [toggleValue, setToggleValue] = useState("feed");
    const [sharedPrompt, setSharedPrompt] = useState("");
    const [sharedModel, setSharedModel] = useState("openai");

    // Hooks
    const {
        entry: slideshowEntry,
        onNewEntry,
        stop,
        error,
        connectionStatus,
    } = useTextSlideshow(mode);

    const { entriesGenerated } = useTextFeedLoader(onNewEntry, setLastEntry);

    const { updateText, cancelGeneration, entry, isLoading } = useTextEditor({
        stop,
        entry: slideshowEntry,
    });

    // Effects
    useEffect(() => {
        if (!entry?.parameters?.messages || isInputChanged) return;
        const prompt = extractPrompt(entry.parameters.messages);
        if (prompt) {
            setSharedPrompt(prompt);
        }
        if (entry.parameters.model) {
            setSharedModel(entry.parameters.model);
        }
    }, [entry, isInputChanged]);

    useEffect(() => {
        setIsInputChanged(false);
    }, [entry?.response]);

    // Handlers
    const handleToggleChange = useCallback(
        (event, newValue) => {
            if (newValue !== null) {
                const isEditMode = newValue === "edit";
                stop(isEditMode);
                setToggleValue(newValue);
                trackEvent({
                    action: "click_text_feed_edit_switch",
                    category: "text_feed",
                    value: isEditMode ? "edit" : "feed",
                });
            }
        },
        [stop],
    );

    const handlePromptClick = useCallback(() => {
        if (toggleValue === "feed") {
            handleToggleChange(null, "edit");
            trackEvent({
                action: "click_text_prompt",
                category: "text_feed",
            });
        }
    }, [toggleValue, handleToggleChange]);

    const handleUpdateText = useCallback(
        (parameters = {}) => {
            updateText({
                model: sharedModel,
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: sharedPrompt || "" },
                ],
                temperature: 0.7,
                max_tokens: 1000,
                type: "chat",
                ...parameters,
            });
        },
        [updateText, sharedPrompt, sharedModel],
    );

    return (
        <>
            {/* Subtitle */}
            <SectionSubContainer>
                <SectionHeadlineStyle>
                    <LLMTextManipulator
                        text={TEXT_FEED_SUBTITLE}
                        transforms={[rephrase, emojify, noLink]}
                    />
                </SectionHeadlineStyle>
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

            {/* Main Content */}
            <SectionSubContainer paddingBottom="4em">
                {entry?.response
                    ? <Box
                          sx={{
                              width: "100%",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                          }}
                      >
                          {/* Feed/Edit Toggle */}
                          <Box display="flex" justifyContent="center" mb={4}>
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
                                      sharedPrompt={sharedPrompt}
                                  />
                              </Box>
                          )}

                          {/* Response Display */}
                          <TextDisplay entry={entry} isLoading={isLoading} />
                      </Box>
                    : <SectionSubContainer>
                          <CircularProgress sx={{ color: Colors.lime }} />
                      </SectionSubContainer>}

                {/* Model Info (Feed mode only) */}
                {toggleValue === "feed" && entry?.response && (
                    <SectionSubContainer paddingBottom="0em">
                        <ModelInfo
                            model={entry.parameters?.model}
                            referrer={entry.parameters?.referrer}
                            itemType="text"
                        />
                    </SectionSubContainer>
                )}
            </SectionSubContainer>
        </> // Use fragment instead of removed wrappers
    );
});

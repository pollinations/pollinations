import React, { useCallback, useEffect } from "react";
import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import { Colors, Fonts } from "../../config/global";
import styled from "@emotion/styled";
import { useModels } from "../../utils/useModels";
import { GeneralButton } from "../GeneralButton";
import { ModelSelector } from "./ModelSelector";
import { LLMTextManipulator } from "../LLMTextManipulator";
import { noLink } from "../../config/llmTransforms";
import { IMAGE_EDIT_BUTTON_OFF } from "../../config/copywrite";
import { keyframes } from "@emotion/react";

const LabelStyle = {
    color: Colors.offwhite,
    fontSize: "1em",
    fontFamily: Fonts?.parameter || "inherit",
};

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

/**
 * TextEditor component for customizing and generating text
 * @param {Object} props - Component props
 */
export const TextEditor = ({
    entry,
    isLoading,
    setIsInputChanged,
    isInputChanged,
    toggleValue,
    updateText,
    cancelGeneration,
    promptOnly = false, // Only render the prompt field
    controlsOnly = false, // Only render the model & button
    // Shared state from parent
    sharedPrompt,
    setSharedPrompt,
    sharedModel,
    setSharedModel,
}) => {
    // Use the new hook with 'text' explicitly passed
    const {
        models,
        loading: modelsLoading,
        error: modelsError,
    } = useModels("text");

    // Add theme and media query for responsive design
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

    // Early return for non-edit mode (except for prompt-only mode)
    if (toggleValue !== "edit" && !promptOnly) {
        return null;
    }

    // If prompt-only mode is requested, return null as this is now handled by PromptDisplay
    if (promptOnly) {
        return null;
    }

    // Log the current sharedPrompt and sharedModel for debugging
    useEffect(() => {
        console.log("TextEditor - Current sharedPrompt:", sharedPrompt);
        console.log("TextEditor - Current sharedModel:", sharedModel);
    }, [sharedPrompt, sharedModel]);

    // Handle form submission
    const handleSubmit = useCallback(() => {
        if (!sharedModel) return;

        console.log(
            "TextEditor - handleSubmit called with prompt:",
            sharedPrompt,
        );
        console.log(
            "TextEditor - handleSubmit called with model:",
            sharedModel,
        );

        const parameters = {
            model: sharedModel,
            messages: [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: sharedPrompt || "" },
            ],
            temperature: 0.7,
            max_tokens: 1000,
            type: "chat",
        };

        updateText(parameters);
    }, [sharedModel, sharedPrompt, updateText]);

    // Handle input changes
    const handleInputChange = useCallback(() => {
        if (!isInputChanged) {
            setIsInputChanged(true);
        }
    }, [isInputChanged, setIsInputChanged]);

    // Render a responsive layout based on screen size
    return (
        <Box sx={{ width: "100%", maxWidth: "1000px" }}>
            <Box
                sx={{
                    display: "flex",
                    flexDirection: isMobile ? "column" : "row",
                    width: "100%",
                }}
            >
                {/* Model Select */}
                <Box
                    sx={{
                        flexGrow: 1,
                        mr: isMobile ? 0 : 2,
                        mb: isMobile ? 2 : 0,
                    }}
                >
                    <ModelSelector
                        itemType="text"
                        currentModel={sharedModel}
                        onModelChange={(value) => {
                            console.log(
                                "ModelSelector - Changed model to:",
                                value,
                            );
                            setSharedModel(value);
                            handleInputChange();
                        }}
                        isLoading={isLoading || modelsLoading}
                        setIsInputChanged={handleInputChange}
                    />
                </Box>

                {/* Generate Button */}
                <Box sx={{ width: isMobile ? "100%" : "auto" }}>
                    <Typography sx={LabelStyle}>&nbsp;</Typography>
                    <GeneralButton
                        handleClick={
                            isLoading ? cancelGeneration : handleSubmit
                        }
                        isLoading={isLoading}
                        isInputChanged={isInputChanged}
                        borderColor={Colors.lime}
                        backgroundColor={Colors.offblack}
                        textColor={Colors.lime}
                        fontSize="1.5em"
                        style={{
                            height: "60px",
                            fontFamily: Fonts.title,
                            width: isMobile ? "100%" : "auto",
                        }}
                    >
                        <LLMTextManipulator
                            text={IMAGE_EDIT_BUTTON_OFF}
                            transforms={[noLink]}
                        />
                    </GeneralButton>
                </Box>
            </Box>
        </Box>
    );
};

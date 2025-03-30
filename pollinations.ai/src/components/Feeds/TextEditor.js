import React, {useCallback } from 'react';
import { 
  Box, 
  Typography
} from '@mui/material';
import { Colors, Fonts } from '../../config/global';
import styled from '@emotion/styled';
import { useTextModels } from '../../utils/useTextModels';
import { GeneralButton } from '../GeneralButton';
import { ModelSelector } from './ModelSelector';
import { LLMTextManipulator } from "../LLMTextManipulator";
import { noLink } from "../../config/llmTransforms";
import { IMAGE_EDIT_BUTTON_OFF } from "../../config/copywrite";
import { keyframes } from "@emotion/react";

const LabelStyle = {
  color: `${Colors.offwhite}99`,
  fontSize: '1em',
  fontFamily: Fonts?.parameter || 'inherit',
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
  promptOnly = false,  // Only render the prompt field
  controlsOnly = false, // Only render the model & button
  // Shared state from parent
  sharedPrompt,
  setSharedPrompt,
  sharedModel,
  setSharedModel
}) => {
  // Fetch available models
  const { models, loading: modelsLoading, error: modelsError } = useTextModels();
  
  // Early return for non-edit mode (except for prompt-only mode)
  if (toggleValue !== 'edit' && !promptOnly) {
    return null;
  }

  // If prompt-only mode is requested, return null as this is now handled by PromptDisplay
  if (promptOnly) {
    return null;
  }
  
  // Handle form submission
  const handleSubmit = useCallback(() => {
    if (!sharedModel) return;

    const parameters = {
      model: sharedModel,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: sharedPrompt || '' }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      type: 'chat'
    };

    updateText(parameters);
  }, [sharedModel, sharedPrompt, updateText]);

  // Handle input changes
  const handleInputChange = useCallback(() => {
    if (!isInputChanged) {
      setIsInputChanged(true);
    }
  }, [isInputChanged, setIsInputChanged]);

  // If we only need to render the controls
  return (
    <Box sx={{ width: '100%', maxWidth: '1000px' }}>
      <Box sx={{ display: 'flex', width: '100%' }}>
        {/* Model Select */}
        <Box sx={{ flexGrow: 1, mr: 2 }}>
          <ModelSelector
            itemType="text"
            currentModel={sharedModel}
            onModelChange={(value) => {
              setSharedModel(value);
              handleInputChange();
            }}
            isLoading={isLoading || modelsLoading}
            setIsInputChanged={handleInputChange}
          />
        </Box>
        
        {/* Generate Button */}
        <Box>
          <Typography sx={LabelStyle}>&nbsp;</Typography>
          <GeneralButton
            handleClick={isLoading ? cancelGeneration : handleSubmit}
            isLoading={isLoading}
            isInputChanged={isInputChanged}
            borderColor={Colors.lime}
            backgroundColor={Colors.offblack + '99'}
            textColor={Colors.lime}
            fontSize="1.5em"
            style={{ 
              height: "60px",
              animation: isLoading ? `${blinkAnimation} 2s ease-in-out infinite` : "none",
              fontFamily: Fonts.title,
            }}
          >
            <LLMTextManipulator text={IMAGE_EDIT_BUTTON_OFF} transforms={[noLink]} />
          </GeneralButton>
        </Box>
      </Box>
    </Box>
  );
}; 
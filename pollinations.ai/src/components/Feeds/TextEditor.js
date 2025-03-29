import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Box, 
  Typography,
  CircularProgress,
} from '@mui/material';
import { Colors, Fonts } from '../../config/global';
import styled from '@emotion/styled';
import { useTextModels } from '../../utils/useTextModels';
import { GeneralButton } from '../GeneralButton';
import { ModelSelector } from './ModelSelector';
import TextareaAutosize from "react-textarea-autosize";
import { LLMTextManipulator } from "../LLMTextManipulator";
import { noLink } from "../../config/llmTransforms";
import { IMAGE_EDIT_BUTTON_OFF } from "../../config/copywrite";
import { keyframes } from "@emotion/react";

const LabelStyle = {
  color: `${Colors.offwhite}99`,
  fontSize: '1em',
  fontFamily: Fonts?.parameter || 'inherit',
};

// Styled components for display
const StyledTextArea = styled(TextareaAutosize, {
  shouldForwardProp: (prop) => !['isEditMode'].includes(prop)
})`
  font-family: ${Fonts?.parameter || 'inherit'};
  font-size: 1.1em;
  color: ${Colors.offwhite};
  padding: 15px;
  resize: none;
  background-color: ${Colors.offblack}99;
  border: none;
  width: 100%;
  line-height: 1.5em;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  
  &:focus {
    outline: none;
  }
  
  /* Hide scrollbar for Chrome, Safari and Opera */
  &::-webkit-scrollbar {
    display: none;
  }
  
  /* Hide scrollbar for IE, Edge and Firefox */
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;     /* Firefox */
`;

const PromptContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isEditMode'
})`
  min-height: 100px;
  height: ${props => props.height || '200px'};
  overflow-y: auto;
  overflow-x: hidden;
  background-color: ${Colors.offblack}99;
  border: 0.5px solid ${Colors.gray2};
  transition: all 0.2s ease;
  cursor: ${props => props.isEditMode ? 'text' : 'pointer'};
  resize: vertical;
  
  /* Scrollbar styles for Chrome, Safari and Opera */
  &::-webkit-scrollbar {
    width: 8px;
    background: transparent;
    display: ${props => props.isEditMode ? 'block' : 'none'};
  }
  
  &::-webkit-scrollbar-thumb {
    background-color: transparent;
  }
  
  /* Show scrollbar on hover for Chrome, Safari and Opera - only in edit mode */
  ${props => props.isEditMode ? `
    &:hover::-webkit-scrollbar-thumb {
      background-color: ${Colors.lime}60;
      border-radius: 4px;
    }
  ` : ''}
  
  /* Scrollbar styles for IE, Edge and Firefox */
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;     /* Firefox */
  
  /* Show scrollbar on hover for Firefox - only in edit mode */
  ${props => props.isEditMode ? `
    &:hover {
      scrollbar-width: thin;
      scrollbar-color: ${Colors.lime}60 transparent;
    }
  ` : ''}

  &:focus-within {
    border-color: ${Colors.lime}80;
  }
  
  &:hover {
    border-color: ${props => props.isEditMode ? Colors.lime80 : Colors.gray2};
    background-color: ${props => props.isEditMode ? Colors.offblack99 : `${Colors.offblack}BB`};
  }
`;

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
  // New shared state from parent
  sharedPrompt,
  setSharedPrompt,
  sharedModel,
  setSharedModel
}) => {
  // Add logging to identify component instances
  const componentId = useRef(Math.random().toString(36).substr(2, 5));
  
  // Fetch available models - this must be outside any conditional
  const { models, loading: modelsLoading, error: modelsError } = useTextModels();

  // Local state only if shared state isn't available
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('openai');
  
  // Use proper state based on whether shared state is provided
  const actualPrompt = (sharedPrompt !== undefined && typeof sharedPrompt === 'string') ? sharedPrompt : (prompt || '');
  const actualSetPrompt = setSharedPrompt || setPrompt;
  const actualModel = sharedModel !== undefined ? sharedModel : model;
  const actualSetModel = setSharedModel || setModel;
  
  // Track the user-defined height of the prompt container
  const [promptHeight, setPromptHeight] = useState(200);
  
  // Flag to track if form has been initialized from entry
  const [isInitialized, setIsInitialized] = useState(false);

  // Reset input changes tracking when toggling to edit mode
  useEffect(() => {
    if (toggleValue === 'edit' && !isInputChanged) {
      setIsInputChanged(false);
    }
  }, [toggleValue, setIsInputChanged, isInputChanged]);

  // Load saved height from localStorage on mount
  useEffect(() => {
    if (promptOnly) {
      const storedHeight = localStorage.getItem('promptHeight');
      if (storedHeight) {
        setPromptHeight(parseInt(storedHeight, 10) || 200);
      }
    }
  }, [promptOnly]);

  // Save height to localStorage when it changes
  useEffect(() => {
    if (promptHeight !== 200) {
      localStorage.setItem('promptHeight', promptHeight.toString());
    }
  }, [promptHeight]);

  // Setup ResizeObserver for the prompt container
  useEffect(() => {
    if (promptOnly) {
      const container = document.querySelector('.prompt-container');
      if (container) {
        const resizeObserver = new ResizeObserver(entries => {
          for (let entry of entries) {
            const newHeight = entry.contentRect.height;
            if (newHeight > 0 && newHeight !== promptHeight) {
              setPromptHeight(newHeight);
              localStorage.setItem('promptHeight', newHeight.toString());
            }
          }
        });
        
        resizeObserver.observe(container);
        
        return () => {
          resizeObserver.disconnect();
        };
      }
    }
  }, [promptOnly, promptHeight]);

  // Update form values when entry changes or models load
  useEffect(() => {
    if (!entry?.parameters) return;
    
    // Don't update values if already initialized and user has made changes
    if (isInitialized && isInputChanged && toggleValue === 'edit') {
      return;
    }

    // Don't update values when in edit mode after initial load
    // This prevents overwriting user edits when clicking generate
    if (isInitialized && toggleValue === 'edit') {
      return;
    }

    let shouldMarkInitialized = false;

    const { messages, model: entryModel } = entry.parameters;
    
    // Find user message (prompt)
    const userMessage = messages?.find(msg => msg?.role === 'user');
    if (userMessage?.content) {
      actualSetPrompt(userMessage.content);
      shouldMarkInitialized = true;
    }
    
    if (toggleValue === 'edit') {
      // Set model - prioritize the current entry's model
      if (entryModel) {
        actualSetModel(entryModel);
      }
      // If no model is set yet and models are loaded, select first available
      else if (!actualModel && models.length > 0) {
        shouldMarkInitialized = true;
        actualSetModel(models[0].id);
      }
    }

    // Mark as initialized if we set any values
    if (shouldMarkInitialized) {
      setIsInitialized(true);
    }
  }, [entry, models, actualModel, isInitialized, isInputChanged, toggleValue, actualSetPrompt, actualSetModel]);

  // Track changes to inputs
  const handleInputChange = useCallback(() => {
    if (!isInputChanged) {
      setIsInputChanged(true);
    }
  }, [isInputChanged, setIsInputChanged]);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    if (!actualModel) {
      return;
    }

    const parameters = {
      model: actualModel,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: actualPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      type: 'chat'
    };

    updateText(parameters);
  }, [actualModel, actualPrompt, updateText]);

  // Track textarea resize - simplify to only track content changes, not manual resizes
  const handleResize = useCallback((event) => {
    // Only handle input-based size changes, not manual resizing
    if (event.type === 'input') {
      handleInputChange();
    }
  }, [handleInputChange]);

  // Track container resize
  const handleContainerResize = useCallback(() => {
    // Wait a moment to make sure resize is complete
    setTimeout(() => {
      const container = document.querySelector('.prompt-container');
      if (container) {
        const newHeight = container.clientHeight;
        if (newHeight !== promptHeight) {
          setPromptHeight(newHeight);
          localStorage.setItem('promptHeight', newHeight.toString());
        }
      }
    }, 100);
  }, [promptHeight]);

  // Determine if models include the currently selected model
  const isModelSupported = actualModel && (models.some(m => m.id === actualModel) || modelsError);

  // If we only need to render the prompt (both edit and feed modes)
  if (promptOnly) {
    const isEditMode = toggleValue === 'edit';
    
    return (
      <PromptContainer 
        className="prompt-container"
        isEditMode={isEditMode}
        onClick={!isEditMode ? () => updateText() : undefined}
        height={`${promptHeight}px`}
        onMouseUp={handleContainerResize}
      >
        <StyledTextArea
          value={actualPrompt}
          onChange={(e) => {
            if (isEditMode) {
              actualSetPrompt(e.target.value);
              handleInputChange();
            }
          }}
          minRows={2}
          maxRows={50}
          cacheMeasurements
          readOnly={!isEditMode}
          onInput={handleResize}
          style={{ 
            cursor: isEditMode ? 'text' : 'pointer',
            padding: '15px',
            height: '100%',
          }}
        />
      </PromptContainer>
    );
  }

  // Early return for non-edit mode (except for prompt-only mode handled above)
  if (toggleValue !== 'edit') {
    return null;
  }

  // If we only need to render the controls
  if (controlsOnly) {
    return (
      <Box sx={{ width: '100%', maxWidth: '1000px' }}>
        <Box sx={{ display: 'flex', width: '100%' }}>
          {/* Model Select */}
          <Box sx={{ flexGrow: 1, mr: 2 }}>
            <ModelSelector
              itemType="text"
              currentModel={actualModel}
              onModelChange={(value) => {
                actualSetModel(value);
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
  }

  return null;
}; 
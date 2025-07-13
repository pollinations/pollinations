import { useState, useEffect } from 'react';

/**
 * Hook to fetch available models from the Pollinations API
 * Supports both text and image model types
 * @param {string} modelType - 'text' or 'image'
 * @returns {Object} - loading, error, models data, and utility functions
 */
export const useModels = (modelType = 'text') => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        const endpoint = modelType === 'text' 
          ? 'https://text.pollinations.ai/models' 
          : 'https://image.pollinations.ai/models';
        
        const response = await fetch(endpoint);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (modelType === 'text') {
          // Process text models with validation
          let processedModels = [];
          
          if (Array.isArray(data)) {
            // Filter out any invalid models and process valid ones
            processedModels = data
              .filter(model => model && model.name && typeof model.name === 'string')
              .map(model => ({
                id: model.name,
                name: model.description ? `${model.name} - ${model.description}` : model.name,
                details: model
              }));
          }
          
          // Sort models alphabetically
          processedModels.sort((a, b) => a.name.localeCompare(b.name));
          
          setModels(processedModels);
        } else {
          // Process image models with validation
          if (Array.isArray(data)) {
            const imageModels = data
              .filter(modelId => modelId && typeof modelId === 'string')
              .map(modelId => ({
                id: modelId,
                name: modelId
              }));
            setModels(imageModels);
          } else {
            console.warn("Unexpected image model data format:", data);
            throw new Error("Unexpected image model data format");
          }
        }
        
        setError(null);
      } catch (err) {
        console.error(`Error fetching ${modelType} models:`, err);
        setError(err.message);
        setModels([]);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, [modelType]);

  // Utility function to check if a model exists
  const isValidModel = (modelId) => {
    return models.some(model => model.id === modelId);
  };

  // Utility function to get a fallback model if current selection is invalid
  const getFallbackModel = (currentModel) => {
    if (isValidModel(currentModel)) {
      return currentModel;
    }
    // Return the first available model as fallback, defaulting to 'openai' for text
    return models.length > 0 ? models[0].id : (modelType === 'text' ? 'openai' : 'flux');
  };

  return { 
    models, 
    loading, 
    error, 
    isValidModel, 
    getFallbackModel 
  };
};
import { useState, useEffect } from 'react';

/**
 * Hook to fetch available models from the Pollinations API
 * Supports both text and image model types
 * @param {string} modelType - 'text' or 'image'
 * @returns {Object} - loading, error, and models data
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
          // Process text models
          let processedModels = [];
          
          if (Array.isArray(data)) {
            // New API format: array of objects with name, type, description, etc.
            processedModels = data
              .filter(model => 
                // Filter out audio models and non-chat models
                model && typeof model === 'object' && 
                model.name && 
                model.type === 'chat' && 
                !model.name.includes('audio')
              )
              .map(model => ({
                id: model.name,
                name: model.description || model.name,
                details: model
              }));
          } else if (typeof data === 'object' && data !== null) {
            // Legacy format (object with keys as model IDs)
            const modelIds = Object.keys(data).filter(key => 
              key !== 'voices' && key !== 'metadata'
            );
            
            processedModels = modelIds
              .filter(id => !id.includes('audio') && !id.includes('tts'))
              .map(id => ({
                id,
                name: id,
                details: data[id]
              }));
          } else {
            console.warn("Unexpected model data format:", data);
            throw new Error("Unexpected model data format");
          }
          
          // Sort models: baseModels first, then alphabetically
          processedModels.sort((a, b) => {
            // First sort by baseModel (if available)
            if (a.details?.baseModel && !b.details?.baseModel) return -1;
            if (!a.details?.baseModel && b.details?.baseModel) return 1;
            
            // Then sort alphabetically
            return a.name.localeCompare(b.name);
          });
          
          setModels(processedModels);
        } else {
          // Process image models - simple array of strings
          if (Array.isArray(data)) {
            const imageModels = data.map(modelId => ({
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

  return { models, loading, error };
}; 
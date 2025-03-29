import { useState, useEffect } from 'react';

/**
 * Hook to fetch available text models from the Pollinations API
 */
export const useTextModels = () => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        const response = await fetch('https://text.pollinations.ai/models');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Process the model data based on the API response structure
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
              name: formatDisplayName(model),
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
              name: formatModelName(id),
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
        setError(null);
      } catch (err) {
        console.error('Error fetching text models:', err);
        setError(err.message);
        // Fallback to hardcoded models in case of error
        setModels([
          { id: 'openai', name: 'OpenAI GPT-4o-mini', details: { description: 'OpenAI GPT-4o-mini' } },
          { id: 'mistral', name: 'Mistral Small 3.1', details: { description: 'Mistral Small 3.1' } },
          { id: 'llama', name: 'Llama 3.3 70B', details: { description: 'Llama 3.3 70B' } },
          { id: 'deepseek', name: 'DeepSeek-V3', details: { description: 'DeepSeek-V3' } }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  /**
   * Format model object into display name
   */
  const formatDisplayName = (model) => {
    if (!model || typeof model !== 'object') return 'Unknown Model';
    
    // Use description if available, otherwise format the name
    if (model.description) {
      return model.description;
    }
    
    return formatModelName(model.name);
  };

  /**
   * Format model IDs into more readable names
   */
  const formatModelName = (modelId) => {
    // Safety check: modelId must be a string
    if (typeof modelId !== 'string') {
      console.warn('Invalid modelId:', modelId);
      return 'Unknown Model';
    }

    // Handle specific known models
    const knownModels = {
      'openai': 'OpenAI GPT-4o-mini',
      'openai-large': 'OpenAI GPT-4o',
      'mistral': 'Mistral Small 3.1',
      'searchgpt': 'SearchGPT',
      'claudetext': 'Claude (Text)',
      'claude-hybridspace': 'Claude HybridSpace',
      'o3-mini': 'O3 Mini',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'gpt-4-turbo': 'GPT-4 Turbo',
    };

    if (knownModels[modelId]) {
      return knownModels[modelId];
    }

    // General formatting for other models
    try {
      return modelId
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .replace(/([0-9]{8})$/, ' ($1)'); // Format dates like 20240307 -> (20240307)
    } catch (e) {
      console.warn('Error formatting model name for:', modelId, e);
      return modelId; // Return original if formatting fails
    }
  };

  return { models, loading, error };
}; 
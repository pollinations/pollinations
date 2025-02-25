# Simplified Refactoring Plan: Model Handler Integration

This document outlines a minimal approach to refactoring the model handling logic with the lowest possible risk.

## Core Problem

The current implementation has model definitions in `availableModels.js` but the handler mapping in `server.js`, creating a maintenance burden when adding or modifying models.

## Minimal Solution

Enhance the `availableModels.js` file to include handler functions for each model, while making minimal changes to `server.js`.

## Implementation Steps

### Step 1: Enhance `availableModels.js`

Add a `getHandler` function to each model object that returns the appropriate handler function:

```javascript
// Import all necessary handler functions
import { generateText } from './generateTextOpenai.js';
import { generateTextScaleway } from './generateTextScaleway.js';
import { generateDeepseek } from './generateDeepseek.js';
// ... other imports

// Import persona prompts
import surSystemPrompt from './personas/sur.js';
// ... other prompts

// Create wrapped models (same as current implementation)
const surOpenai = wrapModelWithContext(surSystemPrompt, generateText);
// ... other wrapped models

export const availableModels = [
    {
        name: 'openai',
        type: 'chat',
        censored: true,
        description: 'OpenAI GPT-4o-mini',
        baseModel: true,
        vision: true,
        getHandler: () => (messages, options) => generateText(messages, options)
    },
    {
        name: 'deepseek',
        type: 'chat',
        censored: true,
        description: 'DeepSeek-V3',
        baseModel: true,
        getHandler: () => (messages, options) => generateDeepseek(messages, {...options, model: 'deepseek-chat'})
    },
    // ... other models
];

// Helper function to get a model handler by name
export function getModelHandler(modelName) {
    const model = availableModels.find(m => m.name === modelName);
    if (model && model.getHandler) {
        return model.getHandler();
    }
    // Default to openai if model not found
    const defaultModel = availableModels.find(m => m.name === 'openai');
    return defaultModel.getHandler();
}
```

### Step 2: Modify `server.js`

Replace the `modelHandlers` object with a call to the new `getModelHandler` function:

```javascript
import { getModelHandler } from './availableModels.js';

async function generateTextBasedOnModel(messages, options) {
    const modelName = options.model || 'openai';
    log('Using model:', modelName);

    try {
        const handler = getModelHandler(modelName);
        const response = await handler(messages, options);
        return response;
    } catch (error) {
        errorLog('Error in generateTextBasedOnModel:', error);
        throw error;
    }
}
```

### Step 3: Testing

1. Run existing tests to ensure they still pass
2. Manually test a few representative models to verify correct behavior

## Benefits of This Approach

1. **Minimal Changes**: Only two files need to be modified
2. **Low Risk**: The core logic remains largely unchanged
3. **Single Source of Truth**: Model definitions and handlers are in one place
4. **Easier Maintenance**: Adding a new model only requires updating `availableModels.js`

## Implementation Timeline

1. Enhance `availableModels.js` - 1 hour
2. Modify `server.js` - 30 minutes
3. Testing - 1 hour

Total estimated time: 2.5 hours
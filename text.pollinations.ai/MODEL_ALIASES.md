# Model Aliases System

This document explains how to use model aliases in the text.pollinations.ai system.

## Overview

The model aliases system allows you to reference AI models using alternative names. Each model has a primary name (the `name` property) and a list of aliases (the `aliases` property) that can be used interchangeably.

## Example Usage

```javascript
import { findModelByName } from './availableModels.js';

// These all reference the same model
const model1 = findModelByName('openai-large');
const model2 = findModelByName('gpt4o');
const model3 = findModelByName('gpt4');

// All three variables point to the OpenAI GPT-4o model
console.log(model1 === model2); // true
console.log(model2 === model3); // true
```

## Available Models and Their Aliases

Below is a list of all available models and their aliases:

| Primary Name | Aliases |
|--------------|---------|
| openai | gpt4o-mini, gpt4-mini, gpt4omini |
| openai-large | gpt4o, gpt4 |
| openai-reasoning | o3-mini, o3mini, reasoning |
| qwen-coder | qwen, coder |
| llama | llama3, llama-3, llama-70b, llama3-70b |
| mistral | mistral-small, mistral3, mistral-3 |
| unity | unity-mistral, unity-large, mistral-unity |
| midijourney | midi, music, abc-notation |
| rtist | artist, image-gen, bqrio |
| searchgpt | search, browser, web-search |
| evil | evil-mode, evil-mistral, unfiltered |
| deepseek-reasoning | deepseek-r1, deepseek-qwen, deepseek32b |
| deepseek-reasoning-large | deepseek-llama, deepseek-70b, deepseek-large |
| llamalight | llama-8b, llama-light, llama-small, llama3-8b |
| phi | phi4, phi-4, phi-instruct |
| llama-vision | llama-v, vision-llama, llama3-vision |
| pixtral | pixtral-12b, pixtral-vision |
| gemini | gemini-flash, gemini-2, gemini2 |
| gemini-reasoning | gemini-thinking, gemini-cot, gemini-r |
| hormoz | hormoz-8b, haghiri |
| hypnosis-tracy | tracy, hypnosis, self-help |
| sur | sur-mistral, sur-ai, assistant-mistral |
| openai-audio | gpt4o-audio, openai-voice, gpt4-audio, tts |

## API Reference

The system provides several utility functions for working with model aliases:

### `findModelByName(modelName)`

Finds a model by its primary name or any of its aliases.

```javascript
const model = findModelByName('gpt4'); // Returns the openai-large model
```

### `isValidModelName(modelName)`

Checks if a given string is a valid model identifier (either a primary name or an alias).

```javascript
if (isValidModelName('unknown-model')) {
  // This won't execute
}

if (isValidModelName('reasoning')) {
  // This will execute
}
```

### `getAllModelAliases()`

Returns an object mapping primary model names to their aliases.

```javascript
const aliasMap = getAllModelAliases();
console.log(aliasMap['openai']); // ['gpt4o-mini', 'gpt4-mini', 'gpt4omini']
```

## Adding New Aliases

To add new aliases to existing models or define aliases for new models, edit the `models` array in `availableModels.js`:

```javascript
{
  name: "model-name",
  description: "Model Description",
  handler: handlerFunction,
  // Add or update the aliases array
  aliases: ["alias1", "alias2", "alias3"],
  // Other properties...
}
```

## Best Practices

1. Keep aliases intuitive and related to the model's name or functionality
2. Avoid using the same alias for multiple models
3. Include common variants and abbreviations users might try
4. Consider using version numbers in aliases for models with version distinctions
5. Document new aliases when adding them 
// Demo script to show model alias functionality
import {
    findModelByName,
    getAllModelAliases,
    isValidModelName,
} from "./availableModels.js";

// Example 1: Finding a model using its primary name
const openaiModel = findModelByName("openai");
console.log("Finding by primary name:", openaiModel.name); // Should print 'openai'

// Example 2: Finding a model using an alias
const modelByAlias = findModelByName("gpt4");
console.log("Finding by alias:", modelByAlias.name); // Should print 'openai-large'

// Example 3: Check if a name is valid (either primary or alias)
console.log('Is "reasoning" valid?', isValidModelName("reasoning")); // Should print true
console.log('Is "unknown-model" valid?', isValidModelName("unknown-model")); // Should print false

// Example 4: Print all available models and their aliases
console.log("\nAll Models and Aliases:");
const allAliases = getAllModelAliases();
Object.entries(allAliases).forEach(([modelName, aliases]) => {
    console.log(`- ${modelName}: ${aliases.join(", ")}`);
});

// Example 5: How to use in another part of the application
function generateTextWithModel(modelNameOrAlias, prompt) {
    const model = findModelByName(modelNameOrAlias);
    if (!model) {
        throw new Error(`Model "${modelNameOrAlias}" not found`);
    }

    console.log(`Using model: ${model.name} (${model.description})`);
    // Now call the appropriate handler
    return model.handler([{ role: "user", content: prompt }], {});
}

// Usage examples:
console.log("\nUsage Examples:");
try {
    // These would normally make API calls in a real environment
    console.log("Example with primary name:");
    // generateTextWithModel('openai', 'Hello, world!');

    console.log("Example with alias:");
    // generateTextWithModel('gpt4', 'Hello, world!');

    console.log("Example with reasoning model:");
    // generateTextWithModel('reasoning', 'Solve this problem step by step');
} catch (error) {
    console.error("Error:", error.message);
}

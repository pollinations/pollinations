// Demo script to show model alias functionality
import { findModelByName } from "./availableModels.js";
import { REGISTRY } from "../shared/registry/registry.js";
import { TEXT_SERVICES } from "../shared/registry/text.js";

// Example 1: Finding a model using its primary name
const openaiModel = findModelByName("openai");
console.log("Finding by primary name:", openaiModel.name); // Should print 'openai'

// Example 2: Finding a model using an alias
const modelByAlias = findModelByName("gpt-5-mini");
console.log("Finding by alias:", modelByAlias?.name); // Should print 'openai'

// Example 3: Check if a name is valid (either primary or alias)
console.log('Is "openai" valid?', REGISTRY.isValidService("openai")); // Should print true
console.log('Is "unknown-model" valid?', REGISTRY.isValidService("unknown-model")); // Should print false

// Example 4: Print all available models and their aliases (from registry)
console.log("\nAll Models and Aliases:");
Object.entries(TEXT_SERVICES).forEach(([serviceName, service]) => {
    console.log(`- ${serviceName}: ${service.aliases.join(", ")}`);
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

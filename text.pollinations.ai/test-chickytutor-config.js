import { findModelByName } from './availableModels.js';
import { portkeyConfig } from './configs/modelConfigs.js';

console.log('Testing chickytutor model configuration...');

const model = findModelByName('chickytutor');
console.log('Model found:', !!model);
console.log('Model name:', model?.name);
console.log('Model config type:', typeof model?.config);

if (model?.config) {
  try {
    console.log('Attempting to call model config function...');
    const config = model.config();
    console.log('Config result:', !!config);
    console.log('Config keys:', Object.keys(config));
    console.log('Config details:', config);
  } catch (error) {
    console.error('❌ Error calling model config:', error.message);
    console.error('Full error:', error);
  }
}

// Also test the portkeyConfig directly
console.log('\nTesting portkeyConfig directly...');
const configKey = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';
console.log('Config key exists:', configKey in portkeyConfig);

if (configKey in portkeyConfig) {
  try {
    const directConfig = portkeyConfig[configKey]();
    console.log('Direct config result:', !!directConfig);
    console.log('Direct config keys:', Object.keys(directConfig));
  } catch (error) {
    console.error('❌ Error with direct config:', error.message);
    console.error('Full error:', error);
  }
}

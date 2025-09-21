import { findModelByName } from './availableModels.js';

const model = findModelByName('chickytutor');
console.log('Model found:', !!model);
console.log('Has transform:', !!model?.transform);
console.log('Has config:', !!model?.config);

if (model) {
  console.log('Model name:', model.name);
  console.log('Model description:', model.description);
  console.log('Transform type:', typeof model.transform);
  console.log('Config type:', typeof model.config);
  
  // Test the transform function
  if (model.transform) {
    try {
      const testMessages = [{ role: 'user', content: 'Hello' }];
      const testOptions = {};
      const result = model.transform(testMessages, testOptions);
      console.log('Transform works:', !!result);
      console.log('Has system message:', result.messages.some(m => m.role === 'system'));
      console.log('First message role:', result.messages[0]?.role);
      console.log('System message preview:', result.messages[0]?.content?.substring(0, 100) + '...');
    } catch (error) {
      console.error('Transform error:', error.message);
    }
  }
}

import { findModelByName } from './availableModels.js';

const bidara = findModelByName('bidara');
console.log('Bidara config type:', typeof bidara.config);
console.log('Bidara config is function:', typeof bidara.config === 'function');

const chickytutor = findModelByName('chickytutor');
console.log('ChickyTutor config type:', typeof chickytutor.config);
console.log('ChickyTutor config is function:', typeof chickytutor.config === 'function');

// Test if the config functions work
if (typeof bidara.config === 'function') {
  try {
    const config = bidara.config();
    console.log('Bidara config result:', !!config);
    console.log('Bidara config keys:', Object.keys(config));
  } catch (e) {
    console.error('Bidara config error:', e.message);
  }
}

if (typeof chickytutor.config === 'function') {
  try {
    const config = chickytutor.config();
    console.log('ChickyTutor config result:', !!config);
    console.log('ChickyTutor config keys:', Object.keys(config));
  } catch (e) {
    console.error('ChickyTutor config error:', e.message);
  }
}

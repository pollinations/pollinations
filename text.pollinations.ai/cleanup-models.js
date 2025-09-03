#!/usr/bin/env node

/**
 * Script to clean up availableModels.js by removing pricing and original_name fields
 */

import fs from 'fs';
import path from 'path';

const filePath = './availableModels.js';

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Remove DEFAULT_PRICING constant and related code
content = content.replace(/const DEFAULT_PRICING = \{[^}]*\};\s*/s, '');

// Remove the modelsWithPricing processing at the end
content = content.replace(/\/\/ Set default pricing using functional approach[\s\S]*?const modelsWithPricing[^;]*;/s, '');

// Replace export with direct export of unsortedModels
content = content.replace(/export const availableModels = modelsWithPricing;/, 'export const availableModels = unsortedModels;');

// Remove original_name fields from model objects
content = content.replace(/\s*original_name:\s*"[^"]*",?\s*/g, '\n\t\t');

// Remove pricing objects from model objects
content = content.replace(/\s*pricing:\s*\{[^}]*\},?\s*/gs, '\n\t\t');

// Clean up any double commas or trailing commas before closing braces
content = content.replace(/,(\s*),/g, '$1');
content = content.replace(/,(\s*)\}/g, '$1}');

// Clean up extra whitespace
content = content.replace(/\n\t\t\n\t\t/g, '\n\t\t');
content = content.replace(/\n\t\t\}/g, '\n\t}');

// Write the cleaned content back
fs.writeFileSync(filePath, content);

console.log('✅ Cleaned up availableModels.js - removed pricing and original_name fields');

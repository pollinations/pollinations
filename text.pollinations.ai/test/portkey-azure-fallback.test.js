import test from 'ava';
import dotenv from 'dotenv';
import debug from 'debug';

const log = debug('pollinations:test:portkey-azure-fallback');
const errorLog = debug('pollinations:test:portkey-azure-fallback:error');

dotenv.config();


/**
 * Test: Azure OpenAI Configuration
 * 
 * Purpose: Verify that the Azure OpenAI configuration is set up correctly
 * 
 * Expected behavior:
 * 1. The portkeyConfig object should contain configurations for all supported models
 * 2. Each configuration should have baseUrl, resourceName, deploymentName, and apiKey properties
 */
test('Azure OpenAI configuration should be set up correctly', t => {
    // Check that portkeyConfig exists and has the expected properties
    t.truthy(portkeyConfig, 'portkeyConfig should exist');
    t.truthy(portkeyConfig['gpt-4o-mini'], 'Should have configuration for gpt-4o-mini');
    t.truthy(portkeyConfig['gpt-4o'], 'Should have configuration for gpt-4o');
    t.truthy(portkeyConfig['o1-mini'], 'Should have configuration for o1-mini');
    
    // Filter Azure models and check that each configuration has the expected properties
    const azureModels = Object.entries(portkeyConfig).filter(([_, config]) => config.provider === 'azure-openai');
    
    for (const [model, config] of azureModels) {
        t.truthy(config.provider === 'azure-openai', `${model} should be an Azure model`);
        t.truthy(config['azure-resource-name'], `${model} should have azure-resource-name`);
        t.truthy(config['azure-deployment-id'], `${model} should have azure-deployment-id`);
        t.truthy(config['azure-api-key'], `${model} should have azure-api-key`);
        t.truthy(config['azure-api-version'], `${model} should have azure-api-version`);
    }
});
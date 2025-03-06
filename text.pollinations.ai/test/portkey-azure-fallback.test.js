import test from 'ava';
import dotenv from 'dotenv';
import debug from 'debug';
import { extractBaseUrl, extractResourceName, extractDeploymentName, portkeyConfig } from '../generateTextPortkey.js';

const log = debug('pollinations:test:portkey-azure-fallback');
const errorLog = debug('pollinations:test:portkey-azure-fallback:error');

dotenv.config();

/**
 * Test: Azure OpenAI Endpoint Extraction
 * 
 * Purpose: Verify that the Azure OpenAI endpoint extraction functions work correctly
 * 
 * Expected behavior:
 * 1. The extractBaseUrl function should extract the base URL from an Azure OpenAI endpoint
 * 2. The extractResourceName function should extract the resource name from an Azure OpenAI endpoint
 * 3. The extractDeploymentName function should extract the deployment name from an Azure OpenAI endpoint
 */
test('Azure OpenAI endpoint extraction functions should work correctly', t => {
    // Test extractBaseUrl
    const baseUrl1 = 'https://pollinations.openai.azure.com';
    const endpoint1 = `${baseUrl1}/openai/deployments/gpt-4o/chat/completions?api-version=2024-08-01-preview`;

    // Test extractBaseUrl
    t.is(extractBaseUrl(endpoint1), baseUrl1, 'Should extract base URL correctly');
    t.is(extractBaseUrl(null), null, 'Should handle null endpoint');
    t.is(extractBaseUrl(undefined), null, 'Should handle undefined endpoint');
    
    // Test extractResourceName
    t.is(extractResourceName(endpoint1), 'pollinations', 'Should extract resource name correctly');
    t.is(extractResourceName('invalid-endpoint'), 'pollinations', 'Should return default value for invalid endpoint');
    
    // Test extractDeploymentName
    t.is(extractDeploymentName(endpoint1), 'gpt-4o', 'Should extract deployment name correctly');
    t.is(extractDeploymentName('invalid-endpoint'), null, 'Should return null for invalid endpoint');
});

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
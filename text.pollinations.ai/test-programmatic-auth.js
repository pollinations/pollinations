#!/usr/bin/env node

// Test script for programmatic Google Cloud authentication
import googleCloudAuth from './auth/googleCloudAuth.js';
import fetch from 'node-fetch';

async function testProgrammaticAuth() {
    console.log('🔧 Testing programmatic Google Cloud authentication...');
    console.log('📁 GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
    console.log('🏗️  GCLOUD_PROJECT_ID:', process.env.GCLOUD_PROJECT_ID);
    
    try {
        // Use the auth client (already initialized)
        const authClient = googleCloudAuth;
        
        if (!authClient) {
            console.error('❌ Failed to initialize Google Cloud auth client');
            return false;
        }
        
        console.log('✅ Auth client initialized successfully');
        
        // Try to get an access token
        console.log('🔑 Attempting to get access token...');
        const token = await authClient.getAccessToken();
        
        if (!token) {
            console.error('❌ Failed to get access token');
            return false;
        }
        
        console.log('✅ Access token obtained successfully!');
        console.log('🔑 Token preview:', token.substring(0, 20) + '...');
        
        // Test with a simple API call to verify the token works
        console.log('🧪 Testing token with Vertex AI API...');
        const response = await fetch(`https://us-central1-aiplatform.googleapis.com/v1/projects/stellar-verve-465920-b7/locations/us-central1/endpoints/openapi/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-ai/deepseek-r1-0528-maas',
                messages: [{ role: 'user', content: 'Hello! This is a test of programmatic authentication.' }],
                max_tokens: 50
            })
        });
        
        if (response.ok) {
            console.log('✅ Vertex AI API call successful!');
            console.log('🎉 Programmatic authentication is working perfectly!');
            return true;
        } else {
            console.error('❌ Vertex AI API call failed:', response.status, response.statusText);
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error during authentication test:', error.message);
        return false;
    }
}

// Run the test
testProgrammaticAuth().then(success => {
    if (success) {
        console.log('\n🎉 SUCCESS: Programmatic authentication is fully configured!');
        console.log('🚀 You can now make Vertex AI requests without manual login.');
    } else {
        console.log('\n❌ FAILED: Programmatic authentication needs troubleshooting.');
    }
    process.exit(success ? 0 : 1);
});

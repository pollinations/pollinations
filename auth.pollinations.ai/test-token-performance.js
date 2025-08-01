#!/usr/bin/env node

/**
 * Performance test script for auth.pollinations.ai token validation
 * Tests both valid and invalid tokens to measure response times
 */

const https = require('https');
const http = require('http');

// Configuration
const AUTH_BASE_URL = 'https://auth.pollinations.ai';
const LOCAL_AUTH_URL = 'http://localhost:8787'; // For local testing if needed
const TEST_TOKEN = 'test-token-12345'; // Invalid token for testing
const VALID_TOKEN = 'pol_test_1234567890abcdef'; // Example format - replace with real token if available

// Test configuration
const NUM_REQUESTS = 10;
const CONCURRENT_REQUESTS = 3;

/**
 * Make a single HTTP request and measure timing
 */
function makeRequest(url, token) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'Pollinations-Performance-Test/1.0'
            }
        };

        const client = urlObj.protocol === 'https:' ? https : http;
        
        const req = client.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                const endTime = Date.now();
                const duration = endTime - startTime;
                
                try {
                    const parsedData = JSON.parse(data);
                    resolve({
                        duration,
                        statusCode: res.statusCode,
                        data: parsedData,
                        headers: res.headers
                    });
                } catch (e) {
                    resolve({
                        duration,
                        statusCode: res.statusCode,
                        data: data,
                        headers: res.headers,
                        parseError: e.message
                    });
                }
            });
        });
        
        req.on('error', (error) => {
            const endTime = Date.now();
            const duration = endTime - startTime;
            reject({
                error: error.message,
                duration
            });
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject({
                error: 'Request timeout',
                duration: 10000
            });
        });
        
        req.end();
    });
}

/**
 * Test token validation endpoint
 */
async function testTokenValidation(baseUrl, token, description) {
    console.log(`\n🧪 Testing ${description}`);
    console.log(`URL: ${baseUrl}/api/validate-token?token=${token.substring(0, 8)}...`);
    
    const results = [];
    const errors = [];
    
    // Sequential requests first
    console.log('\n📊 Sequential Requests:');
    for (let i = 0; i < NUM_REQUESTS; i++) {
        try {
            const result = await makeRequest(`${baseUrl}/api/validate-token?token=${token}`, '');
            results.push(result);
            console.log(`  Request ${i + 1}: ${result.duration}ms (${result.statusCode}) - Valid: ${result.data?.valid || 'N/A'}`);
        } catch (error) {
            errors.push(error);
            console.log(`  Request ${i + 1}: ERROR - ${error.error} (${error.duration}ms)`);
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Concurrent requests
    console.log('\n🚀 Concurrent Requests:');
    const concurrentPromises = [];
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
        concurrentPromises.push(
            makeRequest(`${baseUrl}/api/validate-token?token=${token}`, '').catch(error => ({ error }))
        );
    }
    
    const concurrentResults = await Promise.all(concurrentPromises);
    concurrentResults.forEach((result, i) => {
        if (result.error) {
            console.log(`  Concurrent ${i + 1}: ERROR - ${result.error.error || result.error} (${result.error.duration || 'N/A'}ms)`);
        } else {
            console.log(`  Concurrent ${i + 1}: ${result.duration}ms (${result.statusCode}) - Valid: ${result.data?.valid || 'N/A'}`);
            results.push(result);
        }
    });
    
    // Calculate statistics
    if (results.length > 0) {
        const durations = results.map(r => r.duration);
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        const minDuration = Math.min(...durations);
        const maxDuration = Math.max(...durations);
        const medianDuration = durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)];
        
        console.log('\n📈 Performance Statistics:');
        console.log(`  Total requests: ${results.length}`);
        console.log(`  Average: ${avgDuration.toFixed(2)}ms`);
        console.log(`  Median: ${medianDuration}ms`);
        console.log(`  Min: ${minDuration}ms`);
        console.log(`  Max: ${maxDuration}ms`);
        console.log(`  Errors: ${errors.length}`);
        
        // Check for caching behavior
        const firstRequest = results[0];
        const subsequentRequests = results.slice(1);
        if (subsequentRequests.length > 0) {
            const avgSubsequent = subsequentRequests.reduce((sum, r) => sum + r.duration, 0) / subsequentRequests.length;
            console.log(`  First request: ${firstRequest.duration}ms (likely cache miss)`);
            console.log(`  Avg subsequent: ${avgSubsequent.toFixed(2)}ms (likely cache hits)`);
            
            if (firstRequest.duration > avgSubsequent * 1.5) {
                console.log(`  ✅ Caching appears to be working! (${((firstRequest.duration - avgSubsequent) / firstRequest.duration * 100).toFixed(1)}% faster)`);
            }
        }
    }
    
    return { results, errors };
}

/**
 * Test other endpoints for comparison
 */
async function testOtherEndpoints(baseUrl) {
    console.log('\n🔍 Testing Other Endpoints for Comparison:');
    
    const endpoints = [
        { path: '/api/user', description: 'Get User (requires auth)' },
        { path: '/health', description: 'Health Check' },
        { path: '/', description: 'Root/Dashboard' }
    ];
    
    for (const endpoint of endpoints) {
        try {
            const result = await makeRequest(`${baseUrl}${endpoint.path}`, TEST_TOKEN);
            console.log(`  ${endpoint.description}: ${result.duration}ms (${result.statusCode})`);
        } catch (error) {
            console.log(`  ${endpoint.description}: ERROR - ${error.error} (${error.duration || 'N/A'}ms)`);
        }
    }
}

/**
 * Main test runner
 */
async function runTests() {
    console.log('🚀 Starting auth.pollinations.ai Performance Tests');
    console.log('=' .repeat(60));
    
    // Test invalid token (should be fast, cached)
    await testTokenValidation(AUTH_BASE_URL, TEST_TOKEN, 'Invalid Token (Expected: fast, cached)');
    
    // Test with a different invalid token to see cache behavior
    await testTokenValidation(AUTH_BASE_URL, 'different-invalid-token-67890', 'Different Invalid Token');
    
    // Test other endpoints
    await testOtherEndpoints(AUTH_BASE_URL);
    
    console.log('\n✅ Performance tests completed!');
    console.log('\n💡 Notes:');
    console.log('- First requests may be slower due to cold starts and cache misses');
    console.log('- Subsequent requests should be faster due to caching (60s TTL)');
    console.log('- Invalid tokens should still be processed quickly');
    console.log('- Check the auth service logs for detailed timing information');
}

// Run the tests
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { testTokenValidation, makeRequest };

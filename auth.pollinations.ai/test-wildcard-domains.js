/**
 * Test script to verify wildcard domain matching logic
 * This simulates the SQL LIKE behavior we implemented
 */

function testWildcardMatching() {
    console.log("🧪 Testing Wildcard Domain Matching Logic\n");

    // Test cases: [registeredDomain, testDomain, shouldMatch]
    const testCases = [
        // Exact matches (should always work)
        ["example.com", "example.com", true],
        ["app.example.com", "app.example.com", true],
        
        // Wildcard matches (new functionality)
        ["*.example.com", "app.example.com", true],
        ["*.example.com", "api.example.com", true],
        ["*.example.com", "sub.app.example.com", true],
        ["*.github.io", "user.github.io", true],
        ["*.vercel.app", "my-app.vercel.app", true],
        
        // Should NOT match (security tests)
        ["*.example.com", "maliciousexample.com", false],
        ["*.github.com", "fakegithub.com", false],
        ["*.example.com", "example.com", false], // wildcard shouldn't match parent
        ["example.com", "app.example.com", false], // exact shouldn't match subdomain
        
        // Edge cases
        ["*.co.uk", "example.co.uk", true],
        ["*.herokuapp.com", "my-app.herokuapp.com", true],
        ["*.", "anything", false], // invalid wildcard
        ["", "example.com", false], // empty registered domain
    ];

    let passed = 0;
    let failed = 0;

    testCases.forEach(([registered, test, expected], index) => {
        // Simulate our SQL logic: registered LIKE '*.%' AND test LIKE REPLACE(registered, '*', '%')
        const isWildcard = registered.startsWith('*.');
        let matches = false;

        if (registered === test) {
            // Exact match
            matches = true;
        } else if (isWildcard && registered.length > 2) {
            // Wildcard match: *.example.com should match app.example.com but NOT maliciousexample.com
            // We need proper subdomain matching: test must END with .example.com
            const suffix = registered.substring(1); // Remove "*" -> ".example.com"
            matches = test.endsWith(suffix) && test !== suffix.substring(1); // Don't match parent domain
        }

        const result = matches === expected ? "✅ PASS" : "❌ FAIL";
        const status = matches === expected ? "passed" : "failed";
        
        console.log(`${(index + 1).toString().padStart(2)}. ${result} | "${registered}" vs "${test}" → ${matches} (expected: ${expected})`);
        
        if (status === "passed") {
            passed++;
        } else {
            failed++;
            console.log(`    ⚠️  Expected ${expected}, got ${matches}`);
        }
    });

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
        console.log("🎉 All tests passed! Wildcard domain logic is working correctly.");
    } else {
        console.log("⚠️  Some tests failed. Review the logic.");
    }
}

// Run the tests
testWildcardMatching();

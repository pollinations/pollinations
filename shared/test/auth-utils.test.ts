import { expect, test } from "vitest";
import { isEnterRequest, isValidToken, isDomainWhitelisted } from "../auth-utils.js";

// Test enter.pollinations.ai bypass logic
test("isEnterRequest validates token correctly", () => {
    process.env.ENTER_TOKEN = "test-token-123";
    
    expect(isEnterRequest({ headers: { 'x-enter-token': 'test-token-123' } })).toBe(true);
    expect(isEnterRequest({ headers: { 'x-enter-token': 'wrong-token' } })).toBe(false);
    expect(isEnterRequest({ headers: {} })).toBe(false);
});

test("isEnterRequest handles missing env var", () => {
    delete process.env.ENTER_TOKEN;
    expect(isEnterRequest({ headers: { 'x-enter-token': 'some-token' } })).toBe(false);
});

test("isEnterRequest supports both header access patterns", () => {
    process.env.ENTER_TOKEN = "test-token-123";
    
    // Express/Node.js style
    expect(isEnterRequest({ headers: { 'x-enter-token': 'test-token-123' } })).toBe(true);
    
    // Cloudflare Workers style
    const cfReq = {
        headers: {
            get: (name: string) => name === 'x-enter-token' ? 'test-token-123' : null
        }
    };
    expect(isEnterRequest(cfReq)).toBe(true);
});

// Test token validation utility
test("isValidToken validates against array or comma-separated string", () => {
    // Array format
    expect(isValidToken("token1", ["token1", "token2"])).toBe(true);
    expect(isValidToken("token3", ["token1", "token2"])).toBe(false);
    
    // Comma-separated string format (from env vars)
    expect(isValidToken("token1", "token1,token2,token3")).toBe(true);
    expect(isValidToken("token4", "token1,token2,token3")).toBe(false);
    
    // Edge cases
    expect(isValidToken("", ["token1"])).toBe(false);
    expect(isValidToken(null, ["token1"])).toBe(false);
});

// Test domain whitelist utility
test("isDomainWhitelisted validates referrer domains", () => {
    // Array format
    expect(isDomainWhitelisted("https://example.com/page", ["example.com"])).toBe(true);
    expect(isDomainWhitelisted("https://test.com/page", ["example.com"])).toBe(false);
    
    // Comma-separated string format
    expect(isDomainWhitelisted("https://example.com/page", "example.com,test.com")).toBe(true);
    
    // Partial domain matching
    expect(isDomainWhitelisted("https://sub.example.com/page", ["example.com"])).toBe(true);
    
    // Invalid URL fallback
    expect(isDomainWhitelisted("example.com", ["example.com"])).toBe(true);
    
    // Edge cases
    expect(isDomainWhitelisted("", ["example.com"])).toBe(false);
    expect(isDomainWhitelisted(null, ["example.com"])).toBe(false);
});

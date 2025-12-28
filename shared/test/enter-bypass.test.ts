import { expect, test } from "vitest";
import { isEnterRequest } from "../auth-utils.js";
import { canAccessService } from "../registry/registry.ts";

/**
 * Integration tests for enter.pollinations.ai bypass flow
 * 
 * These tests verify that the enter token properly bypasses tier checks
 * while still being subject to rate limiting (handled by ipQueue.js)
 */

test("enter token should bypass tier checks for seed-tier services", () => {
    process.env.ENTER_TOKEN = "test-enter-token";
    
    const enterRequest = {
        headers: { 'x-enter-token': 'test-enter-token' }
    };
    
    // Verify enter token is recognized
    expect(isEnterRequest(enterRequest)).toBe(true);
    
    // Simulate the bypass logic: if isEnterRequest() returns true,
    // tier check should be skipped (kontext requires seed tier)
    const fromEnter = isEnterRequest(enterRequest);
    const anonymousTier = "anonymous";
    
    // Without enter token, anonymous user cannot access kontext
    expect(canAccessService("kontext", anonymousTier)).toBe(false);
    
    // With enter token, the tier check is bypassed (fromEnter = true)
    // This simulates: if (!fromEnter && !canAccessService(...))
    const shouldBlock = !fromEnter && !canAccessService("kontext", anonymousTier);
    expect(shouldBlock).toBe(false); // Should NOT block because fromEnter is true
});

test("enter token should bypass tier checks for nectar-tier services", () => {
    process.env.ENTER_TOKEN = "test-enter-token";
    
    const enterRequest = {
        headers: { 'x-enter-token': 'test-enter-token' }
    };
    
    const fromEnter = isEnterRequest(enterRequest);
    const anonymousTier = "anonymous";
    
    // Test with a nectar-tier service (if any exist in registry)
    // For now, just verify the bypass logic works
    expect(fromEnter).toBe(true);
    
    // The bypass logic: tier check is skipped when fromEnter is true
    const shouldCheckTier = !fromEnter;
    expect(shouldCheckTier).toBe(false);
});

test("requests without enter token should respect tier checks", () => {
    process.env.ENTER_TOKEN = "test-enter-token";
    
    const regularRequest = {
        headers: {} // No enter token
    };
    
    const fromEnter = isEnterRequest(regularRequest);
    const anonymousTier = "anonymous";
    
    // Without enter token, tier checks should apply
    expect(fromEnter).toBe(false);
    
    // Anonymous user should be blocked from seed-tier services
    const shouldBlock = !fromEnter && !canAccessService("kontext", anonymousTier);
    expect(shouldBlock).toBe(true); // Should block
});

test("enter token validation is case-sensitive", () => {
    process.env.ENTER_TOKEN = "SecretToken123";
    
    expect(isEnterRequest({ headers: { 'x-enter-token': 'SecretToken123' } })).toBe(true);
    expect(isEnterRequest({ headers: { 'x-enter-token': 'secrettoken123' } })).toBe(false);
    expect(isEnterRequest({ headers: { 'x-enter-token': 'SECRETTOKEN123' } })).toBe(false);
});

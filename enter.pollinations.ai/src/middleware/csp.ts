import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";

// Generate a cryptographically secure nonce
function generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array)).replace(/[+/=]/g, "");
}

/**
 * CSP Middleware for Scalar Documentation
 * 
 * Scalar API documentation uses inline scripts for functionality.
 * This middleware provides a balanced CSP policy that allows necessary
 * functionality while maintaining security.
 * 
 * In production, we use a restrictive policy with specific allowances for Scalar.
 * In development, we allow unsafe-inline for easier debugging.
 */
export const cspMiddleware = createMiddleware<Env>(async (c, next) => {
    // Generate nonce for this request
    const nonce = generateNonce();
    
    // Store nonce in custom header for potential use
    c.header("X-CSP-Nonce", nonce);
    
    await next();
    
    // Only apply CSP to HTML responses
    const contentType = c.res.headers.get("content-type");
    if (!contentType?.includes("text/html")) {
        return;
    }
    
    // Get environment
    const isDevelopment = c.env.ENVIRONMENT === "development";
    
    if (isDevelopment) {
        // Development: Allow unsafe-inline for easier debugging
        const devCSP = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Allow inline scripts and eval
            "style-src 'self' 'unsafe-inline'", // Allow inline styles
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self' https:", // Allow API calls
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "upgrade-insecure-requests"
        ].join("; ");
        
        c.header("Content-Security-Policy", devCSP);
        c.header("X-Content-Security-Policy", devCSP); // IE fallback
        c.header("X-WebKit-CSP", devCSP); // Old WebKit fallback
    } else {
        // Production: More restrictive but functional for Scalar
        const prodCSP = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'", // Scalar needs inline scripts
            "style-src 'self' 'unsafe-inline'", // Scalar needs inline styles
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self' https:", // Allow API calls
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "upgrade-insecure-requests"
        ].join("; ");
        
        c.header("Content-Security-Policy", prodCSP);
        c.header("X-Content-Security-Policy", prodCSP);
        c.header("X-WebKit-CSP", prodCSP);
    }
    
    // Add additional security headers
    c.header("X-Frame-Options", "DENY");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("X-XSS-Protection", "1; mode=block");
});
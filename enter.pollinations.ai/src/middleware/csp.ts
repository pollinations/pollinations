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
 * Implements Content Security Policy with nonce-based script protection.
 * The nonce ensures only authorized scripts can execute, preventing XSS attacks.
 * 
 * SECURITY: Production uses nonce-only approach - NO unsafe-inline allowed.
 * Development allows unsafe-inline for debugging convenience only.
 */
export const cspMiddleware = createMiddleware<Env>(async (c, next) => {
    // Generate cryptographic nonce for this request
    const nonce = generateNonce();
    
    // Store nonce in context for templates/scripts to use
    c.set("cspNonce", nonce);
    
    // Expose nonce via header for client-side access if needed
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
        // This is intentionally less secure for development convenience
        const devCSP = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Dev only: allows inline/eval
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self' https:",
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
        // Production: Secure nonce-based policy
        // THE FIX: Removed 'unsafe-inline' and injected nonce into CSP header
        const prodCSP = [
            "default-src 'self'",
            `script-src 'self' 'nonce-${nonce}'`, // THE FIX: nonce-based, NO unsafe-inline
            "style-src 'self' 'unsafe-inline'", // Styles still need inline for Scalar
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self' https:",
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

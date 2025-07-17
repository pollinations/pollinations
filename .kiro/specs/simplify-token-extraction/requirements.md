# Requirements Document

## Introduction

This specification outlines the requirements for simplifying the token extraction logic in the Cloudflare cache worker. Currently, there is duplicated logic for token extraction in `index.js` that can be simplified by fully relying on the shared `extractToken` utility function.

## Requirements

### Requirement 1

**User Story:** As a developer, I want to simplify the token extraction logic in the Cloudflare cache worker, so that the code is more maintainable and follows the DRY (Don't Repeat Yourself) principle.

#### Acceptance Criteria

1. WHEN the worker needs to extract a token from a request THEN it SHALL use only the shared `extractToken` utility function from `shared/extractFromRequest.js`
2. WHEN the worker extracts a token THEN it SHALL NOT create a separate request-like object for token extraction
3. WHEN the worker processes a request THEN it SHALL pass the original request object directly to the `extractToken` function
4. WHEN the worker needs to check token eligibility THEN it SHALL pass the extracted token directly to `isSemanticCacheEligibleForToken`

### Requirement 2

**User Story:** As a developer, I want to ensure the semantic path extraction is clean and robust, so that the caching system correctly identifies and stores semantic content.

#### Acceptance Criteria

1. WHEN extracting semantic path from a URL THEN the system SHALL properly separate the path from query parameters
2. WHEN extracting semantic path from a URL THEN the system SHALL handle embedded parameters in the path (like `/path&token=xyz`)
3. WHEN extracting semantic path from a URL THEN the system SHALL properly decode URL-encoded characters
4. WHEN extracting semantic path from a URL THEN the system SHALL handle URL parsing errors gracefully

### Requirement 3

**User Story:** As a developer, I want to ensure the code is well-documented and follows best practices, so that it's easy to understand and maintain.

#### Acceptance Criteria

1. WHEN simplifying the code THEN all functions SHALL have proper JSDoc comments
2. WHEN simplifying the code THEN variable names SHALL be descriptive and consistent
3. WHEN simplifying the code THEN error handling SHALL be consistent and robust
4. WHEN simplifying the code THEN logging SHALL be clear and helpful for debugging
# Requirements Document

## Introduction

This feature involves extracting pricing information from the availableModels.js file into a separate dedicated pricing module. Currently, pricing data is embedded directly within model definitions, creating tight coupling between model metadata and cost information. This refactoring will improve separation of concerns, making pricing updates easier to manage and maintain while keeping the existing API behavior intact.

## Requirements

### Requirement 1

**User Story:** As a developer maintaining the text.pollinations.ai service, I want pricing information separated from model definitions, so that I can update pricing without modifying model metadata files.

#### Acceptance Criteria

1. WHEN pricing information is moved to a separate file THEN availableModels.js SHALL NOT contain any pricing objects
2. WHEN a new pricing file is created THEN it SHALL contain all existing pricing data mapped by original_name
3. WHEN pricing is extracted THEN the costCalculator.js functionality SHALL remain unchanged
4. WHEN models are requested via API THEN the response SHALL NOT include pricing information (current behavior)

### Requirement 2

**User Story:** As a developer working with model pricing, I want a consistent lookup mechanism, so that pricing resolution works reliably across all models.

#### Acceptance Criteria

1. WHEN pricing is looked up THEN the system SHALL use original_name as the primary key
2. WHEN a model has no original_name THEN the system SHALL fall back to using the model name
3. WHEN no pricing is found THEN the system SHALL return null (current behavior)
4. WHEN default pricing exists THEN it SHALL be applied to models without specific pricing

### Requirement 3

**User Story:** As a system administrator, I want pricing updates to be isolated from model configuration changes, so that pricing modifications don't risk breaking model definitions.

#### Acceptance Criteria

1. WHEN pricing is updated THEN model definitions SHALL remain untouched
2. WHEN new models are added THEN they SHALL NOT require pricing information in the model definition
3. WHEN pricing file is modified THEN the system SHALL continue to function with existing models
4. WHEN pricing lookup fails THEN the cost calculation SHALL handle null pricing gracefully

### Requirement 4

**User Story:** As a developer integrating with the models API, I want the external API behavior to remain unchanged, so that existing integrations continue to work.

#### Acceptance Criteria

1. WHEN /models endpoint is called THEN the response format SHALL remain identical to current implementation
2. WHEN model objects are returned THEN they SHALL NOT contain pricing information (current behavior)
3. WHEN findModelByName is called THEN it SHALL return models without pricing data
4. WHEN cost calculation occurs THEN it SHALL work with the same input parameters as before

### Requirement 5

**User Story:** As a developer maintaining the codebase, I want clear documentation and consistent patterns, so that future pricing additions are straightforward.

#### Acceptance Criteria

1. WHEN the pricing file is created THEN it SHALL include JSDoc documentation for all exported functions
2. WHEN pricing data is structured THEN it SHALL follow a consistent schema for all models
3. WHEN pricing resolution functions are exported THEN they SHALL have clear parameter and return type documentation
4. WHEN default pricing is defined THEN it SHALL be clearly documented and easily modifiable
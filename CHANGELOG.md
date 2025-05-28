# Changelog

All notable changes to the Pollinations ecosystem will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **image.pollinations.ai**: Support for multiple reference images in Azure GPT Image edit mode (PR #2144)
  - Process all images in comma-separated URL parameters
  - Unique field names for each image (image, image1, image2, etc.)
  - Parallel image fetching with progress logging
  - Maintains backward compatibility with single image requests

### Changed
- **auth.pollinations.ai**: Established as the recommended authentication model for all Pollinations services
  - JWT tokens with 24-hour expiration
  - API tokens (16-character, URL-safe) for service access
  - Database-backed domain allowlists
  - Clean separation from referrer-based authentication

- **text.pollinations.ai**: Enhanced authentication and ad system
  - JWT-based authentication support for secure access
  - Dual probability ad system (100% when "p-ads" marker detected, 5% otherwise)
  - Referrer-based frontend app identification
  - Token-based backend authentication with queue bypass

- **model-context-protocol**: Version 1.0.11 improvements
  - Fixed McpServer constructor to correctly pass instructions parameter
  - Added support for multiple reference images in image generation
  - Improved error handling and parameter validation

### Documentation
- Updated all README files to reflect recent changes
- Added comprehensive documentation for multiple reference images feature
- Enhanced authentication documentation across all services
- Added troubleshooting guides for common issues

## [Previous Releases]

### Authentication System Improvements
- Migrated GitHub app authentication to JWT-based system
- Implemented shared authentication utilities across all services
- Centralized environment variable management
- Removed hardcoded domain lists in favor of database-backed allowlists

### Infrastructure Updates
- Cloudflare Workers implementation for image.pollinations.ai
- R2 storage integration for image caching
- Rate limiting improvements with proper IP forwarding
- Enhanced security with proper secret management

### API Enhancements
- Improved error handling across all services
- Better analytics and monitoring capabilities
- Enhanced feed filter CLI tools
- Support for new AI models and providers

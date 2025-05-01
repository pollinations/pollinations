# Pollinations MCP Server Handlers

This directory contains handler modules for the Pollinations Model Context Protocol (MCP) server. These handlers follow the "thin proxy" design principle, focusing on minimal data transformation.

## Design Principles

1. **Thin Proxy**: Handlers act as thin proxies, minimizing data transformation and processing
2. **Modularity**: Each handler module focuses on a specific aspect of the server
3. **Reusability**: Handler functions can be composed and reused in different configurations

## Note on Server Transport

The Pollinations MCP server now exclusively uses stdio transport for communication, following the Model Context Protocol standard. This simplifies the architecture by:

1. Eliminating the need for HTTP server components
2. Enabling direct integration with MCP clients through standard input/output
3. Maintaining the "thin proxy" design principle with minimal overhead

This approach allows the server to be used directly by MCP clients without requiring network configuration or authentication middleware.

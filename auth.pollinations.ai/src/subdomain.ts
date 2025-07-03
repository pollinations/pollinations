import type { Env, Subdomain, SubdomainRegistration, SubdomainStatus, SubdomainUpdate } from './types';
import { verifyJWT, extractBearerToken } from './jwt';
import { 
  listSubdomains, 
  registerSubdomain, 
  updateSubdomain, 
  deleteSubdomain, 
  getSubdomainStatus, 
  findSubdomain 
} from './db';

/**
 * Handle listing user's subdomains
 */
export async function handleListSubdomains(
  request: Request, 
  env: Env, 
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  
  if (!userId) {
    return createErrorResponse(400, 'Missing required parameter: user_id', corsHeaders);
  }
  
  // Verify auth
  const token = extractBearerToken(request);
  if (!token) {
    return createErrorResponse(401, 'Unauthorized', corsHeaders);
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || payload.sub !== userId) {
    return createErrorResponse(403, 'Forbidden', corsHeaders);
  }
  
  // Get the user's subdomains
  const subdomains = await listSubdomains(env.DB, userId);
  
  return new Response(JSON.stringify({ subdomains }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle registering a new subdomain
 */
export async function handleRegisterSubdomain(
  request: Request, 
  env: Env, 
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  
  if (!userId) {
    return createErrorResponse(400, 'Missing required parameter: user_id', corsHeaders);
  }
  
  // Verify auth
  const token = extractBearerToken(request);
  if (!token) {
    return createErrorResponse(401, 'Unauthorized', corsHeaders);
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || payload.sub !== userId) {
    return createErrorResponse(403, 'Forbidden', corsHeaders);
  }
  
  try {
    // Parse request body
    const registration = await request.json() as SubdomainRegistration;
    
    // Validate subdomain format
    if (!registration.subdomain || !isValidSubdomain(registration.subdomain)) {
      return createErrorResponse(400, 'Invalid subdomain format', corsHeaders);
    }
    
    // Validate required fields
    if (!registration.source) {
      return createErrorResponse(400, 'Missing required field: source', corsHeaders);
    }
    
    // For GitHub Pages source, repo is required
    if (registration.source === 'github_pages' && !registration.repo) {
      return createErrorResponse(400, 'GitHub repository is required for GitHub Pages source', corsHeaders);
    }
    
    // Validate GitHub repository exists and is accessible
    if (registration.source === 'github_pages' && registration.repo) {
      const isValidRepo = await validateGitHubRepository(registration.repo, env);
      if (!isValidRepo) {
        return createErrorResponse(400, 'GitHub repository does not exist or is not accessible', corsHeaders);
      }
    }
    
    // Register the subdomain
    const subdomain = await registerSubdomain(env.DB, userId, registration);
    
    if (!subdomain) {
      return createErrorResponse(409, 'Subdomain already exists or registration failed', corsHeaders);
    }
    
    return new Response(JSON.stringify({ subdomain }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error registering subdomain:', error);
    return createErrorResponse(400, 'Invalid request body', corsHeaders);
  }
}

/**
 * Handle updating a subdomain
 */
export async function handleUpdateSubdomain(
  request: Request, 
  env: Env, 
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  const subdomainName = url.pathname.split('/').pop(); // Extract subdomain from URL path
  
  if (!userId || !subdomainName) {
    return createErrorResponse(400, 'Missing required parameters', corsHeaders);
  }
  
  // Verify auth
  const token = extractBearerToken(request);
  if (!token) {
    return createErrorResponse(401, 'Unauthorized', corsHeaders);
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || payload.sub !== userId) {
    return createErrorResponse(403, 'Forbidden', corsHeaders);
  }
  
  try {
    // Parse request body
    const update = await request.json() as SubdomainUpdate;
    
    // For GitHub Pages source, repo is required
    if (update.source === 'github_pages' && update.repo === undefined) {
      return createErrorResponse(400, 'GitHub repository is required for GitHub Pages source', corsHeaders);
    }
    
    // Validate GitHub repository exists and is accessible
    if (update.source === 'github_pages' && update.repo) {
      const isValidRepo = await validateGitHubRepository(update.repo, env);
      if (!isValidRepo) {
        return createErrorResponse(400, 'GitHub repository does not exist or is not accessible', corsHeaders);
      }
    }
    
    // Update the subdomain
    const subdomain = await updateSubdomain(env.DB, userId, subdomainName, update);
    
    if (!subdomain) {
      return createErrorResponse(404, 'Subdomain not found or update failed', corsHeaders);
    }
    
    return new Response(JSON.stringify({ subdomain }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating subdomain:', error);
    return createErrorResponse(400, 'Invalid request body', corsHeaders);
  }
}

/**
 * Handle deleting a subdomain
 */
export async function handleDeleteSubdomain(
  request: Request, 
  env: Env, 
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  const subdomainName = url.pathname.split('/').pop(); // Extract subdomain from URL path
  
  if (!userId || !subdomainName) {
    return createErrorResponse(400, 'Missing required parameters', corsHeaders);
  }
  
  // Verify auth
  const token = extractBearerToken(request);
  if (!token) {
    return createErrorResponse(401, 'Unauthorized', corsHeaders);
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || payload.sub !== userId) {
    return createErrorResponse(403, 'Forbidden', corsHeaders);
  }
  
  // Delete the subdomain
  const success = await deleteSubdomain(env.DB, userId, subdomainName);
  
  if (!success) {
    return createErrorResponse(404, 'Subdomain not found or deletion failed', corsHeaders);
  }
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle getting subdomain status
 */
export async function handleGetSubdomainStatus(
  request: Request, 
  env: Env, 
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  const subdomainName = url.pathname.split('/').pop(); // Extract subdomain from URL path
  
  if (!userId || !subdomainName) {
    return createErrorResponse(400, 'Missing required parameters', corsHeaders);
  }
  
  // Verify auth
  const token = extractBearerToken(request);
  if (!token) {
    return createErrorResponse(401, 'Unauthorized', corsHeaders);
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || payload.sub !== userId) {
    return createErrorResponse(403, 'Forbidden', corsHeaders);
  }
  
  // Get the subdomain status
  const status = await getSubdomainStatus(env.DB, userId, subdomainName);
  
  if (!status) {
    return createErrorResponse(404, 'Subdomain not found', corsHeaders);
  }
  
  return new Response(JSON.stringify({ status }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle resolving a subdomain to its GitHub Pages repository
 * This endpoint is public but rate-limited to prevent enumeration attacks
 */
export async function handleResolveSubdomain(
  request: Request, 
  env: Env, 
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const subdomainName = url.searchParams.get('subdomain');
  
  if (!subdomainName) {
    return createErrorResponse(400, 'Missing required parameter: subdomain', corsHeaders);
  }
  
  // Basic rate limiting: check if subdomain name looks suspicious
  // Reject requests with very short names or obvious enumeration patterns
  if (subdomainName.length < 2 || /^[a-z]{1,2}$/.test(subdomainName)) {
    return createErrorResponse(400, 'Invalid subdomain format', corsHeaders);
  }
  
  // Add a small delay to make enumeration attacks less efficient
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Find the subdomain
  const subdomain = await findSubdomain(env.DB, subdomainName);
  
  if (!subdomain) {
    return createErrorResponse(404, 'Subdomain not found', corsHeaders);
  }
  
  // Return the subdomain information (excluding sensitive fields)
  return new Response(JSON.stringify({
    subdomain: subdomain.subdomain,
    source: subdomain.source,
    repo: subdomain.repo,
    custom_domain: subdomain.custom_domain,
    last_published: subdomain.last_published
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Validate subdomain format
 * @param subdomain Subdomain to validate
 * @returns True if valid, false otherwise
 */
function isValidSubdomain(subdomain: string): boolean {
  // Reserved subdomains that conflict with existing services
  const reservedSubdomains = new Set([
    'auth', 'image', 'text', 'api', 'www', 'app', 'admin', 'cdn', 
    'static', 'assets', 'blog', 'docs', 'help', 'support', 'status',
    'mail', 'email', 'ftp', 'ssh', 'vpn', 'n8n', 'websim'
  ]);
  
  if (reservedSubdomains.has(subdomain.toLowerCase())) {
    return false;
  }
  
  // Subdomain should be alphanumeric with hyphens, 2-63 characters
  // Allow single chars or 2+ chars with proper start/end validation
  const subdomainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  return subdomainRegex.test(subdomain) && subdomain.length >= 2 && subdomain.length <= 63;
}

/**
 * Validate that a GitHub repository exists and is accessible
 * @param repo Repository in format "owner/repo"
 * @param env Environment variables
 * @returns True if repository is valid and accessible
 */
async function validateGitHubRepository(repo: string, env: Env): Promise<boolean> {
  try {
    // Validate repo format
    if (!repo || !repo.includes('/')) {
      return false;
    }
    
    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      return false;
    }
    
    // Check if repository exists and is public via GitHub API
    const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      headers: {
        'User-Agent': 'Pollinations-Subdomain-Service',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      return false;
    }
    
    const repoData = await response.json();
    
    // Ensure repository is public and not archived
    return !repoData.private && !repoData.archived;
  } catch (error) {
    console.error('Error validating GitHub repository:', error);
    return false;
  }
}

/**
 * Creates a standardized error response
 * @param status HTTP status code
 * @param message User-friendly error message
 * @param headers Response headers
 * @returns Standardized error response
 */
function createErrorResponse(status: number, message: string, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({
    error: true,
    message
  }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}
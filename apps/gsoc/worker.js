export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    try {
      // Route to appropriate handler
      if (path === '/api/socbot' && request.method === 'POST') {
        return await handleSocBot(request, env, corsHeaders);
      }

      if (path === '/api/github/contributors' && request.method === 'GET') {
        return await handleGitHubContributors(request, env, corsHeaders);
      }

      // 404
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error', message: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }
  },
};

/**
 * Handle socBot API calls - proxy to Pollinations
 */
async function handleSocBot(request, env, corsHeaders) {
  const body = await request.json();
  const { messages } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'Invalid request format' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get API key from env (set by Cloudflare Pages/Workers)
  const apiKey = env.PLN_GITHUB_PROJECT_MANAGER_SK_KEY;
  if (!apiKey) {
    console.error('Missing PLN_GITHUB_PROJECT_MANAGER_SK_KEY');
    return new Response(JSON.stringify({ error: 'API configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Call Pollinations API
  const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai',
      messages: messages,
      max_tokens: 1000,
    }),
  });

  const data = await response.json();

  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle GitHub contributors - proxy to GitHub API
 */
async function handleGitHubContributors(request, env, corsHeaders) {
  // Get GitHub token from env
  const ghToken = env.GH_TOKEN;
  if (!ghToken) {
    console.error('Missing GH_TOKEN');
    return new Response(JSON.stringify({ error: 'API configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Call GitHub API
  const response = await fetch(
    'https://api.github.com/repos/pollinations/pollinations/contributors?per_page=10&sort=contributions',
    {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${ghToken}`,
        'User-Agent': 'pollinations-gsoc',
      },
    },
  );

  const data = await response.json();

  // Filter out bots
  const filtered = Array.isArray(data)
    ? data.filter((c) => !c.login.includes('[bot]') && !c.login.includes('dependabot')).slice(0, 10)
    : data;

  return new Response(JSON.stringify(filtered), {
    status: response.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

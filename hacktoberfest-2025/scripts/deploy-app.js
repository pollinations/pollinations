#!/usr/bin/env node

/**
 * Minimal POC: Deploy Hacktoberfest app to Cloudflare Pages + custom subdomain
 * 
 * Usage: node deploy-app.js <appName>
 */

const fs = require('fs');
const path = require('path');

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const TURNSTILE_SITE_ID = process.env.TURNSTILE_SITE_ID;

async function deployApp(appName) {
  console.log(`🚀 Deploying ${appName}...`);

  // Load config
  const configPath = path.join(__dirname, '../apps.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const appConfig = config[appName];

  if (!appConfig) {
    throw new Error(`App ${appName} not found in apps.json`);
  }

  const subdomain = appConfig.subdomain || appName;
  const projectName = `hacktoberfest-${subdomain}`;
  const customDomain = `${subdomain}.pollinations.ai`;

  console.log(`📦 Project: ${projectName}`);
  console.log(`🌐 Domain: ${customDomain}`);

  // Step 1: Create Pages project
  console.log('\n1️⃣ Creating Cloudflare Pages project...');
  const createResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectName,
        production_branch: 'master',
        build_config: {
          build_command: appConfig.buildCommand || '',
          destination_dir: appConfig.outputDir || '.',
        },
      }),
    }
  );

  const createResult = await createResponse.json();
  
  if (!createResponse.ok && !createResult.errors?.some(e => e.code === 8000003)) {
    // 8000003 = project already exists
    throw new Error(`Failed to create project: ${JSON.stringify(createResult)}`);
  }

  console.log('✅ Project created/exists');

  // Step 2: Add custom domain
  console.log('\n2️⃣ Adding custom domain...');
  const domainResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/domains`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: customDomain,
      }),
    }
  );

  const domainResult = await domainResponse.json();
  
  if (!domainResponse.ok && !domainResult.errors?.some(e => e.code === 8000007)) {
    // 8000007 = domain already exists
    console.warn(`⚠️  Domain setup: ${JSON.stringify(domainResult)}`);
  } else {
    console.log('✅ Custom domain added');
  }

  // Step 3: Update Turnstile (placeholder - needs actual API)
  console.log('\n3️⃣ Updating Turnstile allowlist...');
  console.log(`⚠️  Manual step: Add ${customDomain} to Turnstile widget ${TURNSTILE_SITE_ID}`);
  console.log('   https://dash.cloudflare.com/?to=/:account/turnstile');

  console.log(`\n✨ Deployment complete!`);
  console.log(`🔗 App will be available at: https://${customDomain}`);
  console.log(`📝 Next: Upload files to project via Wrangler or Direct Upload API`);
}

// CLI
const appName = process.argv[2];
if (!appName) {
  console.error('Usage: node deploy-app.js <appName>');
  process.exit(1);
}

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  console.error('❌ Missing required env vars: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID');
  process.exit(1);
}

deployApp(appName).catch(err => {
  console.error('❌ Deployment failed:', err.message);
  process.exit(1);
});

# Google Cloud Authentication for Vertex AI

This document explains how to set up and use Google Cloud authentication for Vertex AI in the Pollinations application.

## Overview

The application uses Google Vertex AI for text generation, which requires authentication with Google Cloud. We've implemented a solution that uses service account credentials to authenticate with Google Cloud, eliminating the need for manual `gcloud auth login` commands.

## Setup Instructions

### Automatic Setup

We provide a setup script that automates the installation and configuration process:

```bash
# Make the script executable if it's not already
chmod +x setup-google-cloud-auth.sh

# Run the setup script
sudo ./setup-google-cloud-auth.sh
```

The script will guide you through the following steps:
1. Installing the Google Cloud CLI
2. Initializing gcloud and setting your project
3. Creating or selecting a service account
4. Creating and downloading a service account key
5. Testing the authentication

### Manual Setup

If you prefer to set up manually, follow these steps:

1. **Install Google Cloud CLI**:
   ```bash
   # Add the Cloud SDK distribution URI as a package source
   echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list

   # Import the Google Cloud public key
   curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key --keyring /usr/share/keyrings/cloud.google.gpg add -

   # Update and install the SDK
   sudo apt-get update && sudo apt-get install google-cloud-cli
   ```

2. **Authenticate and set project**:
   ```bash
   # Log in to Google Cloud
   gcloud auth login

   # Set your project
   gcloud config set project YOUR_PROJECT_ID
   ```

3. **Create a service account and key**:
   ```bash
   # Create service account
   gcloud iam service-accounts create vertex-ai-client --display-name="Vertex AI Client"

   # Grant necessary roles
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:vertex-ai-client@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/aiplatform.user"

   # Create and download key
   mkdir -p credentials
   gcloud iam service-accounts keys create credentials/google_vertex_key.json \
     --iam-account=vertex-ai-client@YOUR_PROJECT_ID.iam.gserviceaccount.com
   
   # Set secure permissions
   chmod 600 credentials/google_vertex_key.json
   ```

4. **Set environment variable**:
   Add to your `.env` file:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/credentials/google_vertex_key.json
   GCLOUD_PROJECT_ID=YOUR_PROJECT_ID
   ```

## How It Works

The application uses a dedicated module (`googleCloudAuth.js`) to handle Google Cloud authentication:

1. The module uses the service account credentials specified by the `GOOGLE_APPLICATION_CREDENTIALS` environment variable
2. It provides functions to get and refresh access tokens
3. It automatically refreshes the token every 50 minutes (tokens typically expire after 60 minutes)

## Usage in Code

To use the authentication module in your code:

```javascript
import googleCloudAuth from './googleCloudAuth.js';

// Get the current token
const token = googleCloudAuth.getToken();

// Use the token refresh function directly (useful for APIs that need a fresh token)
const authFunction = googleCloudAuth.getToken;
```

## Troubleshooting

If you encounter authentication issues:

1. **Check environment variable**: Ensure `GOOGLE_APPLICATION_CREDENTIALS` points to the correct file
2. **Verify service account permissions**: The service account needs the `roles/aiplatform.user` role
3. **Test token generation**: Run `gcloud auth print-access-token` to test if token generation works
4. **Check key file**: Ensure the key file exists and has the correct permissions (600)

## Security Considerations

- **Never commit service account keys to version control**
- Keep the key file secure with restricted permissions (`chmod 600`)
- Consider using more secure authentication methods like Workload Identity Federation for production environments

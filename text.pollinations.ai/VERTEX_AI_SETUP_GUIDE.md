# Vertex AI Authentication Setup Guide

## ✅ Current Working Configuration (August 6, 2025)

This setup is **FULLY WORKING** and tested for programmatic authentication with Vertex AI.

### Service Account Details
- **Project ID**: `stellar-verve-465920-b7`
- **Service Account**: `vertex-ai-client@stellar-verve-465920-b7.iam.gserviceaccount.com`
- **Key File**: `credentials/google_vertex_key.json`
- **Permissions**: `roles/aiplatform.user`

### Environment Variables (in .env)
```bash
GOOGLE_APPLICATION_CREDENTIALS=/home/ubuntu/pollinations/text.pollinations.ai/credentials/google_vertex_key.json
GCLOUD_PROJECT_ID=stellar-verve-465920-b7
```

### Testing
```bash
# Test programmatic authentication
node test-programmatic-auth.js

# Expected output:
# 🎉 SUCCESS: Programmatic authentication is fully configured!
# 🚀 You can now make Vertex AI requests without manual login.
```

### Working API Example
```bash
# This works without manual login:
curl \
  -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  https://us-central1-aiplatform.googleapis.com/v1/projects/stellar-verve-465920-b7/locations/us-central1/endpoints/openapi/chat/completions \
  -d '{"model":"deepseek-ai/deepseek-r1-0528-maas", "messages":[{"role": "user", "content": "Hello!"}]}'
```

## 🔧 Troubleshooting

### If "Key creation is not allowed" Error
This occurs due to organizational policy. To fix:

**Option 1: Google Cloud Console**
1. Go to [Organization Policies](https://console.cloud.google.com/iam-admin/orgpolicies)
2. Find "Disable service account key creation"
3. Edit policy → Customize → Set Enforcement to "off"

**Option 2: gcloud CLI** (requires Organization Policy Administrator role)
```bash
gcloud resource-manager org-policies disable-enforce iam.disableServiceAccountKeyCreation --organization=231606865087
```

## 📚 Related Files
- **Authentication Module**: `auth/googleCloudAuth.js`
- **Documentation**: `auth/GOOGLE_CLOUD_AUTH.md`
- **Setup Script**: `scripts/setup-google-cloud-auth.sh`
- **Test Script**: `test-programmatic-auth.js`

## 🎯 Key Benefits
- ✅ No manual `gcloud auth login` required
- ✅ Automatic token refresh every 50 minutes
- ✅ Works with existing `googleCloudAuth.js` module
- ✅ Fully tested with DeepSeek model on Vertex AI

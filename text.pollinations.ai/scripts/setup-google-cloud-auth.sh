#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored messages
print_message() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check if script is run with sudo
if [ "$EUID" -ne 0 ]; then
  print_warning "This script might need sudo privileges for some operations."
  print_warning "If you encounter permission errors, please run with sudo."
  read -p "Continue without sudo? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Create directories
print_message "Creating directories..."
mkdir -p credentials

# Step 1: Install Google Cloud CLI
install_gcloud_cli() {
  print_message "Step 1: Installing Google Cloud CLI..."
  
  # Check if gcloud is already installed
  if command -v gcloud &> /dev/null; then
    print_message "Google Cloud CLI is already installed."
    gcloud --version
  else
    print_message "Installing Google Cloud CLI..."
    
    # Install dependencies
    apt-get update && apt-get install -y apt-transport-https ca-certificates gnupg curl
    
    # Add the Google Cloud SDK distribution URI as a package source
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
    
    # Import the Google Cloud public key
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key --keyring /usr/share/keyrings/cloud.google.gpg add -
    
    # Update and install the Google Cloud SDK
    apt-get update && apt-get install -y google-cloud-cli
    
    print_message "Google Cloud CLI installed successfully."
  fi
}

# Step 2: Initialize gcloud and authenticate
init_gcloud() {
  print_message "Step 2: Initializing gcloud and authenticating..."
  
  # Check if already logged in
  if gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    CURRENT_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
    print_message "Already logged in as: $CURRENT_ACCOUNT"
  else
    print_message "Please log in to Google Cloud..."
    gcloud auth login
  fi
  
  # Set the project
  read -p "Enter your Google Cloud project ID: " PROJECT_ID
  gcloud config set project $PROJECT_ID
  print_message "Project set to: $PROJECT_ID"
  
  # Update .env file with project ID
  if [ -f .env ]; then
    if grep -q "GCLOUD_PROJECT_ID" .env; then
      sed -i "s/GCLOUD_PROJECT_ID=.*/GCLOUD_PROJECT_ID=$PROJECT_ID/" .env
    else
      echo "GCLOUD_PROJECT_ID=$PROJECT_ID" >> .env
    fi
    print_message "Updated GCLOUD_PROJECT_ID in .env file."
  else
    echo "GCLOUD_PROJECT_ID=$PROJECT_ID" > .env
    print_message "Created .env file with GCLOUD_PROJECT_ID."
  fi
}

# Step 3: Create or use existing service account
setup_service_account() {
  print_message "Step 3: Setting up service account..."
  
  # List existing service accounts
  print_message "Listing existing service accounts..."
  gcloud iam service-accounts list
  
  # Ask if user wants to use existing or create new
  read -p "Do you want to use an existing service account? (y/n): " USE_EXISTING
  
  if [[ $USE_EXISTING =~ ^[Yy]$ ]]; then
    read -p "Enter the email of the existing service account: " SA_EMAIL
  else
    read -p "Enter a name for the new service account (e.g., vertex-ai-client): " SA_NAME
    read -p "Enter a display name for the service account (e.g., 'Vertex AI Client'): " SA_DISPLAY_NAME
    
    # Create service account
    print_message "Creating service account: $SA_NAME..."
    gcloud iam service-accounts create $SA_NAME \
      --display-name="$SA_DISPLAY_NAME"
    
    SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
    print_message "Service account created: $SA_EMAIL"
    
    # Grant necessary roles
    print_message "Granting necessary roles to the service account..."
    gcloud projects add-iam-policy-binding $PROJECT_ID \
      --member="serviceAccount:$SA_EMAIL" \
      --role="roles/aiplatform.user"
    
    print_message "Roles assigned successfully."
  fi
  
  # Create and download key
  print_message "Creating service account key..."
  KEY_FILE="credentials/google_vertex_key.json"
  gcloud iam service-accounts keys create $KEY_FILE \
    --iam-account=$SA_EMAIL
  
  # Update .env file with credentials path
  if [ -f .env ]; then
    if grep -q "GOOGLE_APPLICATION_CREDENTIALS" .env; then
      sed -i "s|GOOGLE_APPLICATION_CREDENTIALS=.*|GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/$KEY_FILE|" .env
    else
      echo "GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/$KEY_FILE" >> .env
    fi
  else
    echo "GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/$KEY_FILE" > .env
  fi
  
  print_message "Service account key created and saved to $KEY_FILE"
  print_message "Updated GOOGLE_APPLICATION_CREDENTIALS in .env file."
  
  # Set permissions on the key file
  chmod 600 $KEY_FILE
  print_message "Set secure permissions on key file."
}

# Step 4: Test the authentication
test_auth() {
  print_message "Step 4: Testing authentication..."
  
  # Source the .env file to get the credentials path
  if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
  fi
  
  print_message "Using credentials: $GOOGLE_APPLICATION_CREDENTIALS"
  
  # Test authentication
  if gcloud auth print-access-token --verbosity=error > /dev/null; then
    print_message "Authentication successful! Token generated correctly."
  else
    print_error "Authentication failed. Please check your credentials and permissions."
    exit 1
  fi
}

# Step 5: Final instructions
final_instructions() {
  print_message "Setup completed successfully!"
  print_message "Your Google Cloud authentication is now configured to use service account credentials."
  print_message ""
  print_message "Important notes:"
  print_message "1. The service account key is stored in: $KEY_FILE"
  print_message "2. Keep this file secure and never commit it to version control."
  print_message "3. The GOOGLE_APPLICATION_CREDENTIALS environment variable has been added to your .env file."
  print_message "4. Your application will now use this service account for authentication."
  print_message ""
  print_message "To test the authentication in your Node.js application, run:"
  print_message "node -e \"import('./googleCloudAuth.js').then(auth => { console.log('Token:', auth.default.getToken().substring(0, 20) + '...'); console.log('Auth module initialized successfully!'); })\""
}

# Main execution
print_message "Starting Google Cloud Authentication Setup..."

# Ask which steps to run
read -p "Install Google Cloud CLI? (y/n): " INSTALL_CLI
read -p "Initialize gcloud and set project? (y/n): " INIT_GCLOUD
read -p "Setup service account and create key? (y/n): " SETUP_SA
read -p "Test authentication? (y/n): " TEST_AUTH

# Run selected steps
[[ $INSTALL_CLI =~ ^[Yy]$ ]] && install_gcloud_cli
[[ $INIT_GCLOUD =~ ^[Yy]$ ]] && init_gcloud
[[ $SETUP_SA =~ ^[Yy]$ ]] && setup_service_account
[[ $TEST_AUTH =~ ^[Yy]$ ]] && test_auth

final_instructions

print_message "Setup script completed!"

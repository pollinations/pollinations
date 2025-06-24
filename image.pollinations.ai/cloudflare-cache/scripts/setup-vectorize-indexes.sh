#!/bin/bash

# Setup script for Vectorize metadata indexes
# This ensures all required metadata indexes exist for semantic caching
# Should be run before deployment to ensure proper filtering performance

set -e

# Configuration
INDEX_NAME="pollinations-image-cache"

echo "🚀 Setting up Vectorize metadata indexes for $INDEX_NAME"

# Function to create index if it doesn't exist
create_index_if_missing() {
    local property_name=$1
    local property_type=$2
    
    echo "📋 Checking if metadata index '$property_name' exists..."
    
    # Check if index exists by listing all indexes and grepping for the property
    if wrangler vectorize list-metadata-index $INDEX_NAME | grep -q "$property_name"; then
        echo "✅ Metadata index '$property_name' already exists"
    else
        echo "🔧 Creating metadata index '$property_name' (type: $property_type)..."
        wrangler vectorize create-metadata-index $INDEX_NAME --property-name $property_name --type $property_type
        echo "✅ Created metadata index '$property_name'"
    fi
}

# Required metadata indexes for semantic caching
echo ""
echo "Creating required metadata indexes for semantic cache filtering:"

# bucket: Used for resolution + seed isolation (e.g., "512x512_seed42")
create_index_if_missing "bucket" "string"

# model: Used for model filtering (e.g., "flux", "sdxl")
create_index_if_missing "model" "string"

# seed: Used for seed isolation filtering (e.g., "42", "999")
create_index_if_missing "seed" "string"

echo ""
echo "🎉 All metadata indexes are ready!"
echo ""
echo "📋 Current metadata indexes:"
wrangler vectorize list-metadata-index $INDEX_NAME

echo ""
echo "ℹ️  Note: Vectors upserted before index creation won't be indexed."
echo "   Re-upserting vectors after index creation will index them properly."

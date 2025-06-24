#!/bin/bash

set -e

INDEX_NAME="pollinations-image-cache"

echo "🧹 Creating fresh Vectorize index: $INDEX_NAME"
echo "================================================"

# Step 1: Create new index
echo "1. Creating new index..."
wrangler vectorize create "$INDEX_NAME" \
    --dimensions=768 \
    --metric=cosine \
    --description="Semantic image cache for Pollinations"
echo "   ✅ Index created"

# Step 2: Wait a moment for index to be ready
echo ""
echo "2. Waiting for index to be ready..."
sleep 3

# Step 3: Create metadata indexes
echo ""
echo "3. Creating metadata indexes..."

echo "   Creating 'bucket' index..."
wrangler vectorize create-metadata-index "$INDEX_NAME" \
    --property-name bucket \
    --type string

echo "   Creating 'model' index..."
wrangler vectorize create-metadata-index "$INDEX_NAME" \
    --property-name model \
    --type string

echo "   Creating 'seed' index..."
wrangler vectorize create-metadata-index "$INDEX_NAME" \
    --property-name seed \
    --type string

echo "   ✅ All metadata indexes created"

# Step 4: Verify setup
echo ""
echo "4. Verifying setup..."
echo "   📋 Index details:"
wrangler vectorize get "$INDEX_NAME"

echo ""
echo "   📋 Metadata indexes:"
wrangler vectorize list-metadata-index "$INDEX_NAME"

echo ""
echo "🎉 Vectorize index creation complete!"
echo "   Index: $INDEX_NAME"
echo "   Dimensions: 768"
echo "   Metric: cosine" 
echo "   Metadata indexes: bucket, model, seed"
echo ""
echo "Ready to deploy and test semantic caching!"

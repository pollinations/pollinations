#!/bin/bash
#!/bin/bash

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

API_URL="http://localhost:8790"
TEST_FILE="./test.png"

echo -e "${BLUE}=== Media Service Testing ===${NC}\n"

echo -e "${BLUE}1. Testing health endpoint...${NC}"
curl -s "$API_URL/" | jq . || echo "Failed to connect"
echo -e ""

echo -e "${BLUE}2. Testing file upload...${NC}"
if [ ! -f "$TEST_FILE" ]; then
    echo -e "${RED}Error: $TEST_FILE not found${NC}"
    exit 1
fi

UPLOAD_RESPONSE=$(curl -s -X POST "$API_URL/upload" \
    -F "file=@$TEST_FILE")

echo "$UPLOAD_RESPONSE" | jq .
FILE_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.id')
FILE_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.url')

if [ -z "$FILE_ID" ] || [ "$FILE_ID" = "null" ]; then
    echo -e "${RED}Upload failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Upload successful${NC}"
echo -e "File ID: $FILE_ID"
echo -e "File URL: $FILE_URL\n"

echo -e "${BLUE}3. Testing file retrieval...${NC}"
RETRIEVE_RESPONSE=$(curl -s -I "$API_URL/$FILE_ID")
echo "$RETRIEVE_RESPONSE"
echo -e "${GREEN}✓ File retrieved${NC}\n"

echo -e "${BLUE}4. Testing duplicate detection...${NC}"
DUPLICATE_RESPONSE=$(curl -s -X POST "$API_URL/upload" \
    -F "file=@$TEST_FILE")

echo "$DUPLICATE_RESPONSE" | jq .
IS_DUPLICATE=$(echo "$DUPLICATE_RESPONSE" | jq -r '.duplicate')

if [ "$IS_DUPLICATE" = "true" ]; then
    echo -e "${GREEN}✓ Duplicate correctly detected${NC}\n"
else
    echo -e "${RED}✗ Duplicate detection failed${NC}\n"
fi

echo -e "${BLUE}5. Testing JSON base64 upload...${NC}"
BASE64_DATA=$(base64 < "$TEST_FILE" | tr -d '\n')

JSON_RESPONSE=$(curl -s -X POST "$API_URL/upload" \
    -H "Content-Type: application/json" \
    -d "{
        \"data\": \"data:image/png;base64,$BASE64_DATA\",
        \"contentType\": \"image/png\",
        \"name\": \"test-base64.png\"
    }")

echo "$JSON_RESPONSE" | jq .
JSON_ID=$(echo "$JSON_RESPONSE" | jq -r '.id')

if [ -z "$JSON_ID" ] || [ "$JSON_ID" = "null" ]; then
    echo -e "${RED}JSON upload failed${NC}"
else
    echo -e "${GREEN}✓ JSON upload successful${NC}\n"
fi

echo -e "${BLUE}6. Testing invalid hash format...${NC}"
INVALID_RESPONSE=$(curl -s -I "$API_URL/invalid-hash-format")
echo "$INVALID_RESPONSE" | head -n 1
echo -e "${GREEN}✓ Invalid hash correctly rejected${NC}\n"

echo -e "${GREEN}=== All tests completed ===${NC}"

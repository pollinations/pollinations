# Run Node.js tests for backend services
cd text.pollinations.ai && npm test
cd ../image.pollinations.ai && npm test

# Run Python tests (if any exist)
python3 -m pytest tests/

# Build frontend to catch any build errors
cd ../pollinations.ai && npm run build
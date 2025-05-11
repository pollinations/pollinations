#!/bin/bash
set +e  # Continue on errors

# Formatter function
format_with_prettier() {
    local dir=$1
    if [ -d "$dir" ]; then
        echo "Formatting code in $dir..."
        (cd "$dir" && npx prettier --write "**/*.{js,jsx,ts,tsx,json,css,md}" || true)
    fi
}

# Function to run tests for a specific project
run_tests() {
    local dir=$1
    if [ -d "$dir" ]; then
        echo "Running tests for $dir..."
        (cd "$dir" && npm test)
        if [ $? -ne 0 ]; then
            echo "WARNING: Tests failed for $dir"
            # Continue execution, let GitHub CI handle test failures
        fi
    fi
}

# Format JavaScript/TypeScript files in each project
if [ -d "pollinations.ai" ]; then
    format_with_prettier "pollinations.ai"
fi

if [ -d "text.pollinations.ai" ]; then
    format_with_prettier "text.pollinations.ai"
fi

if [ -d "image.pollinations.ai" ]; then
    format_with_prettier "image.pollinations.ai"
fi

if [ -d "pollinations-react" ]; then
    format_with_prettier "pollinations-react"
fi

if [ -d "model-context-protocol" ]; then
    format_with_prettier "model-context-protocol"
fi

# Run tests for each project to ensure nothing breaks
echo "Running tests to ensure code quality..."

if [ -d "text.pollinations.ai" ]; then
    run_tests "text.pollinations.ai"
fi

if [ -d "image.pollinations.ai" ]; then
    run_tests "image.pollinations.ai"
fi

if [ -d "pollinations.ai" ]; then
    # For React frontend, we only want to run tests in non-watch mode
    echo "Running tests for pollinations.ai..."
    (cd pollinations.ai && npm test -- --watchAll=false)
    if [ $? -ne 0 ]; then
        echo "WARNING: Tests failed for pollinations.ai"
    fi
fi

echo "Precommit checks completed!"

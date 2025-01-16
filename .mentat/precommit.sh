if [ -d "text.pollinations.ai" ]; then
    (cd text.pollinations.ai && npm test)
fi

if [ -d "image.pollinations.ai" ]; then
    (cd image.pollinations.ai && npm test)
fi

if [ -d "pollinations.ai" ]; then
    (cd pollinations.ai && npm test)
fi
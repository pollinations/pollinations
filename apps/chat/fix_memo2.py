import re
with open("src/components/MemoizedMessageContent.jsx", "r") as f:
    text = f.read()

# I will replace multiple instances of this exact handle previews block with a single one.
block_regex = r'// Handle previews[\s\S]*?setPreviews\(foundPreviews\);\s*\}'
matches = re.findall(block_regex, text)
if len(matches) > 1:
    # replace all with empty string
    text = re.sub(block_regex, '', text)
    # put one back before `// Handle charts`
    text = text.replace('// Handle charts (existing logic)', matches[0] + '\n\n      // Handle charts (existing logic)')

with open("src/components/MemoizedMessageContent.jsx", "w") as f:
    f.write(text)

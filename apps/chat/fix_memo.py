import re
with open("src/components/MemoizedMessageContent.jsx", "r") as f:
    text = f.read()

# I will replace the entie duplicate block regex
text = re.sub(r'(// Handle previews.*?setPreviews\(foundPreviews\);\n      }\n      \n      )// Handle previews.*?setPreviews\(foundPreviews\);\n      }', r'\1', text, flags=re.DOTALL)

with open("src/components/MemoizedMessageContent.jsx", "w") as f:
    f.write(text)

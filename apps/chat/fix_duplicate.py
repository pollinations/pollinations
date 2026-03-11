import re

with open('src/components/ChatInput.jsx', 'r') as f:
    text = f.read()

# The duplicate block seems to be `<div className="mode-quick-toggles">...</div>` exactly repeated.
# We can find this by regex or just find the div and remove the second one.

pattern = r'(<div className="mode-quick-toggles">.*?</div>\s*)<div className="mode-quick-toggles">.*?</div>'
text_new = re.sub(pattern, r'\1', text, flags=re.DOTALL)

with open('src/components/ChatInput.jsx', 'w') as f:
    f.write(text_new)

print("Done")

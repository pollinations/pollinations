import re
with open("src/utils/markdown.js", "r") as f:
    text = f.read()

# Replace duplicated blocks
block = """
    // Extract HTML preview markers
    const previewRegex = /__HTML_PREVIEW__(.*?)__HTML_PREVIEW__/g;
    const previews = [];
    let previewMatch;
    while ((previewMatch = previewRegex.exec(textContent)) !== null) {
      try {
        previews.push(JSON.parse(previewMatch[1]));
      } catch(e) {}
    }
    textContent = textContent.replace(previewRegex, '');
"""
# just substitute previewRegex2 entirely
text = re.sub(r'// Extract HTML preview markers.*?textContent = textContent\.replace\(previewRegex, \'\'\);', '', text, flags=re.DOTALL)

with open("src/utils/markdown.js", "w") as f:
    f.write(text.replace("// Extract chart markers", block + "\n    // Extract chart markers"))


import re

with open('src/utils/markdown.js', 'r') as f:
    text = f.read()

# 1. Regex to extract __HTML_PREVIEW__
extract_preview_patch = """
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

# inject before // Extract chart markers
text = text.replace("// Extract chart markers", extract_preview_patch + "\n    // Extract chart markers")

# 2. Append preview data to returned html
append_preview_patch = """
    // Append HTML preview data
    if (previews.length > 0) {
      previews.forEach(preview => {
        html += "<div class='html-preview-tool' data-preview='" + escapeHtml(JSON.stringify(preview)) + "'></div>";
      });
    }
"""

text = text.replace("// Append chart data", append_preview_patch + "\n    // Append chart data")

with open('src/utils/markdown.js', 'w') as f:
    f.write(text)

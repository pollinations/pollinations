with open("src/components/MemoizedMessageContent.jsx", "r") as f:
    text = f.read()

# Add previews state
text = text.replace("const [charts, setCharts] = React.useState([]);", "const [charts, setCharts] = React.useState([]);\n  const [previews, setPreviews] = React.useState([]);")

# Add handling previews logic
preview_code = """
      // Handle previews
      const previewDivs = containerRef.current.querySelectorAll('.html-preview-tool');
      if (previewDivs && previewDivs.length > 0) {
        const foundPreviews = [];
        previewDivs.forEach((div) => {
          try {
            const previewData = JSON.parse(decodeURIComponent(div.dataset.preview));
            foundPreviews.push(previewData);
            div.style.display = 'none'; // hide marker
          } catch(e) {}
        });
        setPreviews(foundPreviews);
      }
      
      // Handle charts (existing logic)"""

text = text.replace("// Handle charts (existing logic)", preview_code)

# Render previews below content
render_code = """
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />
      {previews.map((preview, idx) => (
        <div key={`preview-${idx}`} className="canvas-preview-container">
          <div className="canvas-preview-header">
            <span>{preview.title || "HTML App"}</span>
          </div>
          <iframe 
            srcDoc={preview.html}
            className="canvas-preview-iframe"
            sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
            title={preview.title}
          />
        </div>
      ))}
"""

text = text.replace("<div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />", render_code)

with open("src/components/MemoizedMessageContent.jsx", "w") as f:
    f.write(text)

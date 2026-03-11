import re

with open('src/components/MemoizedMessageContent.jsx', 'r') as f:
    text = f.read()

# Add a previews state logic in MemoizedMessageContent
state_patch = "const [charts, setCharts] = React.useState([]);\n  const [previews, setPreviews] = React.useState([]);"
text = text.replace("const [charts, setCharts] = React.useState([]);", state_patch)

effect_patch = """
      // Handle previews
      const previewDivs = containerRef.current.querySelectorAll('.html-preview-tool');
      if (previewDivs && previewDivs.length > 0) {
        const foundPreviews = [];
        previewDivs.forEach(div => {
           const attr = div.getAttribute('data-preview');
           if (attr) {
              try {
                foundPreviews.push(JSON.parse(attr));
                div.remove();
              } catch(e) {}
           }
        });
        if (foundPreviews.length > 0) {
           setPreviews(foundPreviews);
        }
      }
"""

text = text.replace("// Handle charts (existing logic)", effect_patch + "\n      // Handle charts (existing logic)")

render_patch = """
      {charts.map((chartData, index) => (
        <ChartRenderer key={index} chartData={chartData} />
      ))}
      {previews.map((preview, index) => (
        <div key={`preview-${index}`} className="canvas-preview-container">
            <div className="canvas-preview-header">
                <span className="canvas-preview-title">{preview.title || "HTML Preview"}</span>
            </div>
            <iframe 
                srcDoc={preview.html} 
                sandbox="allow-scripts allow-forms allow-same-origin"
                className="canvas-preview-iframe"
            />
        </div>
      ))}
"""

text = re.sub(r'\{charts\.map\(\(chartData, index\) \=> \([\s\S]*?\}\)\}', render_patch, text)

with open('src/components/MemoizedMessageContent.jsx', 'w') as f:
    f.write(text)

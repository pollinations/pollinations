import React, { memo, useEffect, useRef } from 'react';
import { formatMessage } from '../utils/markdown';
import ChartRenderer from './ChartRenderer';

const MemoizedMessageContent = memo(({ content }) => {
  const html = formatMessage(content);
  const containerRef = useRef(null);
  const [charts, setCharts] = React.useState([]);
  const [previews, setPreviews] = React.useState([]);

  useEffect(() => {
    if (containerRef.current) {
      
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
      
      // Handle charts (existing logic)
      const chartDiv = containerRef.current.querySelector('[data-charts]');
      if (chartDiv) {
        const chartsAttr = chartDiv.getAttribute('data-charts');
        if (chartsAttr) {
          try {
            const parsedCharts = JSON.parse(chartsAttr.replace(/&apos;/g, "'"));
            setCharts(parsedCharts);
            chartDiv.remove();
          } catch (e) {}
        }
      }

      // Add copy buttons to code blocks
      const codeBlocks = containerRef.current.querySelectorAll('pre.code-block');
      codeBlocks.forEach(block => {
        if (!block.querySelector('.copy-code-btn')) {
          block.style.position = 'relative';
          const btn = document.createElement('button');
          btn.className = 'copy-code-btn';
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy';
          btn.onclick = () => {
            const codeEl = block.querySelector('code');
            if (codeEl) {
              navigator.clipboard.writeText(codeEl.innerText);
              btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
              setTimeout(() => {
                btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy';
              }, 2000);
            }
          };
          block.appendChild(btn);
        }
      });
    }
  }, [html]);

  return (
    <>
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
      {charts.map((chartData, index) => (
        <ChartRenderer key={index} chartData={chartData} />
      ))}
    </>
  );
});

export default MemoizedMessageContent;
